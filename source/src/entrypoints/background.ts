import { browser } from 'wxt/browser';
import { PLATFORMS, conversationKey, detectPlatform, type PlatformId } from '@/lib/platforms';
import type { DeleteJob, HelloReply, Msg } from '@/lib/messages';
import { addOrphan, deleteThread, getThread, listThreads, patchThread, putThread, removeOrphan } from '@/lib/store';
import type { Thread } from '@/lib/types';

/**
 * MV3 service workers die at any time, so nothing lives in module memory:
 *   delete jobs        → storage.session   (timeouts: chrome.alarms)
 *   pending injections → storage.session   (one-shot, keyed by tab)
 *   "bind" records     → storage.session   (new thread chat waiting for its URL, keyed by tab)
 */

const JOB_TIMEOUT_MS = 60_000;

interface Job extends DeleteJob { threadId: string; url: string; tabId?: number; windowId?: number; reuse?: boolean }
type Settle = { ok: true } | { ok: false; error: string };

let lockChain: Promise<unknown> = Promise.resolve();
const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = lockChain.then(fn, fn);
  lockChain = run.catch(() => undefined);
  return run;
};

const session = browser.storage.session;
const readJobs = async (): Promise<Record<string, Job>> => ((await session.get('jobs')).jobs as Record<string, Job> | undefined) ?? {};
const writeJobs = (jobs: Record<string, Job>) => session.set({ jobs });

const injKey = (tabId: number) => `inj:${tabId}`;
const bindKey = (tabId: number) => `bind:${tabId}`;

async function takeInjection(tabId?: number) {
  if (tabId == null) return null;
  const k = injKey(tabId);
  const v = (await session.get(k))[k] as { text: string; mergeThreadId?: string } | undefined;
  if (v) await session.remove(k);
  return v ?? null;
}

const toMatchPattern = (url: string) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname}*`;
};

async function focusTab(tab: { id?: number; windowId?: number }) {
  if (tab.id != null) await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
}

// ── binding: remember the thread chat's address the moment it exists ──
const cleanUrl = (url: string) => {
  const u = new URL(url);
  return u.origin + u.pathname; // drop ?query / #hash so reopening always lands on the exact conversation
};

async function bindThread(platformId: PlatformId, threadId: string, url: string, tabId?: number) {
  const key = conversationKey(platformId, url);
  const t = await getThread(platformId, threadId);
  if (key && t && !t.conversationUrl && key !== t.parentKey) {
    const taken = (await listThreads(platformId)).some((x) => x.conversationKey === key);
    if (!taken) await patchThread(platformId, threadId, { conversationUrl: cleanUrl(url), conversationKey: key });
  }
  if (key && tabId != null) await session.remove(bindKey(tabId));
}

/** The still-open window of a thread whose chat has not been bound yet. */
async function findBindTab(threadId: string) {
  const all = await session.get(null);
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('bind:') || v !== threadId) continue;
    const tabId = Number(k.slice(5));
    try {
      const tab = await browser.tabs.get(tabId);
      return { tabId, windowId: tab.windowId, url: tab.url ?? '' };
    } catch {
      await session.remove(k); // tab is gone
    }
  }
  return null;
}

// ── threads ──
async function createThread(m: Extract<Msg, { type: 'CREATE_THREAD' }>) {
  const parentKey = conversationKey(m.platformId, m.parentUrl);
  if (!parentKey) throw new Error('Open a saved chat first: a thread needs a chat to branch from.');

  const siblings = (await listThreads(m.platformId)).filter((t) => t.parentKey === parentKey).length;
  const now = Date.now();
  const thread: Thread = {
    id: crypto.randomUUID(),
    platformId: m.platformId,
    title: m.title?.trim() || `Thread ${siblings + 1}`,
    status: 'active',
    parentUrl: m.parentUrl,
    parentKey,
    anchor: m.anchor,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await putThread(thread);
  await openFreshChatWindow(thread);
}

/** New browser window with an empty chat (no copied context). Its URL is bound once the first message is sent. */
async function openFreshChatWindow(thread: Thread) {
  await withLock(async () => {
    const w = await browser.windows.create({ url: PLATFORMS[thread.platformId].newChatUrl, state: 'maximized' });
    const tabId = w?.tabs?.[0]?.id;
    if (tabId == null) throw new Error('Could not open a new window.');
    await session.set({ [bindKey(tabId)]: thread.id });
  });
}

async function openThread(platformId: PlatformId, threadId: string) {
  let t = await getThread(platformId, threadId);
  if (!t) throw new Error('Thread not found.');
  if (t.status === 'deleting') throw new Error('This thread is being deleted.');

  // Not bound yet: its window may still be open. Bring THAT forward instead of making a new chat.
  if (!t.conversationUrl) {
    const bt = await findBindTab(t.id);
    if (bt) {
      await bindThread(platformId, t.id, bt.url, bt.tabId);
      t = (await getThread(platformId, threadId)) ?? t;
      if (!t.conversationUrl) { await focusTab({ id: bt.tabId, windowId: bt.windowId }); return; }
    }
  }
  if (!t.conversationUrl) { // truly never started (its window was closed before any message)
    await openFreshChatWindow(t);
    return;
  }

  // Already open → focus it. Otherwise open the thread's own conversation (never a new chat).
  const [existing] = await browser.tabs.query({ url: toMatchPattern(t.conversationUrl) });
  if (existing) { await focusTab(existing); return; }
  await browser.windows.create({ url: t.conversationUrl, state: 'maximized', focused: true });
}

async function mergeToMain(m: Extract<Msg, { type: 'MERGE_TO_MAIN' }>) {
  const t = await getThread(m.platformId, m.threadId);
  if (!t) throw new Error('Thread not found.');
  const text = `From my side thread "${t.title}":\n\n${m.text}`;

  const [main] = await browser.tabs.query({ url: toMatchPattern(t.parentUrl) });
  if (main?.id != null) {
    await focusTab(main);
    try {
      const r = (await browser.tabs.sendMessage(main.id, { type: 'INJECT_TEXT', text })) as { ok: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'Injection failed');
      await patchThread(t.platformId, t.id, { mergedAt: Date.now() });
      return;
    } catch {
      // Content script not alive in that tab: reload it and inject on load (it reports MARK_MERGED itself).
      await withLock(async () => { await session.set({ [injKey(main.id!)]: { text, mergeThreadId: t.id } }); });
      await browser.tabs.reload(main.id);
      return;
    }
  }
  await withLock(async () => {
    const tab = await browser.tabs.create({ url: t.parentUrl });
    if (tab.id != null) await session.set({ [injKey(tab.id)]: { text, mergeThreadId: t.id } });
  });
}

// ── deleting a thread AND its chat ──
async function removeThread(m: Extract<Msg, { type: 'DELETE_THREAD' }>) {
  let t = await getThread(m.platformId, m.threadId);
  if (!t) return;

  if (!t.conversationUrl) {
    // Its window may still be open and already hold a real chat that was never bound: bind it now so it gets deleted.
    const bt = await findBindTab(t.id);
    if (bt && conversationKey(t.platformId, bt.url)) {
      await bindThread(t.platformId, t.id, bt.url, bt.tabId);
      t = (await getThread(m.platformId, m.threadId)) ?? t;
    }
    if (!t.conversationUrl) { // only an empty chat (no messages) exists: nothing on the site to delete
      if (bt) await browser.tabs.remove(bt.tabId).catch(() => undefined);
      await deleteThread(t.platformId, t.id);
      return;
    }
  }
  await patchThread(t.platformId, t.id, { status: 'deleting' });

  const job: Job = { id: crypto.randomUUID(), platformId: t.platformId, threadId: t.id, url: t.conversationUrl! };
  try {
    await withLock(async () => {
      const [open] = await browser.tabs.query({ url: toMatchPattern(job.url) });
      if (open?.id != null) {
        job.tabId = open.id; // the chat is already open: delete it right there
        job.reuse = true;
      } else {
        const w = await browser.windows.create({ url: job.url, state: 'normal', focused: false, width: 1000, height: 720 });
        job.tabId = w?.tabs?.[0]?.id;
        job.windowId = w?.id;
      }
      const jobs = await readJobs();
      jobs[job.id] = job;
      await writeJobs(jobs);
      browser.alarms.create(`job:${job.id}`, { delayInMinutes: JOB_TIMEOUT_MS / 60_000 });
    });
    if (job.reuse && job.tabId != null) {
      browser.tabs.sendMessage(job.tabId, { type: 'RUN_DELETE', jobId: job.id }).catch(() =>
        settleJob(job.id, { ok: false, error: 'Could not reach the open chat tab. Reload it and try again.' }),
      );
    }
  } catch (e) {
    await settleJob(job.id, { ok: false, error: e instanceof Error ? e.message : 'Could not start the delete.' }, job);
  }
}

/**
 * The thread record is removed in EVERY case. If the chat itself could not be deleted,
 * an "orphan" notice tells the user which chat is left to remove by hand.
 */
async function settleJob(jobId: string, result: Settle, fallback?: Job) {
  const job = await withLock(async () => {
    const jobs = await readJobs();
    const j = jobs[jobId] ?? fallback;
    if (!j) return null;
    delete jobs[jobId];
    await writeJobs(jobs);
    return j;
  });
  if (!job) return;
  await browser.alarms.clear(`job:${jobId}`);

  if (result.ok || !job.reuse) { // never close a tab the user is looking at after a failure
    try {
      if (job.windowId != null) await browser.windows.remove(job.windowId);
      else if (job.tabId != null) await browser.tabs.remove(job.tabId);
    } catch { /* already closed */ }
  }

  const t = await getThread(job.platformId, job.threadId);
  await deleteThread(job.platformId, job.threadId);
  if (!result.ok && t) {
    await addOrphan({
      id: crypto.randomUUID(),
      platformId: job.platformId,
      parentKey: t.parentKey,
      title: t.title,
      url: job.url,
      reason: result.error,
      at: Date.now(),
    });
  }
}

// ── bookkeeping ──
async function hello(tabId?: number): Promise<HelloReply> {
  return withLock(async () => {
    const job = Object.values(await readJobs()).find((j) => j.tabId === tabId && !j.reuse);
    if (job) return { role: 'deleter', job: { id: job.id, platformId: job.platformId } };
    const inj = await takeInjection(tabId);
    if (inj) return { role: 'inject', ...inj };
    if (tabId != null) {
      const bound = (await session.get(bindKey(tabId)))[bindKey(tabId)] as string | undefined;
      if (bound) return { role: 'bind', threadId: bound };
    }
    return { role: 'normal' };
  });
}

async function recover() {
  await withLock(async () => {
    const live = new Set(Object.values(await readJobs()).map((j) => j.threadId));
    for (const p of Object.keys(PLATFORMS) as PlatformId[]) {
      for (const t of await listThreads(p)) {
        if (t.status === 'deleting' && !live.has(t.id)) await patchThread(p, t.id, { status: 'active' });
      }
    }
  });
}

async function handle(msg: Msg, sender: { tab?: { id?: number } }): Promise<unknown> {
  switch (msg.type) {
    case 'HELLO': return hello(sender.tab?.id);
    case 'PING': return { ok: true };
    case 'CREATE_THREAD': await createThread(msg); return { ok: true };
    case 'OPEN_THREAD': await openThread(msg.platformId, msg.threadId); return { ok: true };
    case 'BIND_THREAD_URL': await bindThread(msg.platformId, msg.threadId, msg.url, sender.tab?.id); return { ok: true };
    case 'THREAD_STATS': {
      const t = await getThread(msg.platformId, msg.threadId);
      if (!t) return { ok: true };
      const last = msg.last && { role: msg.last.role, text: msg.last.text.slice(0, 200) };
      if (t.messageCount === msg.count && t.lastMessage?.text === last?.text) return { ok: true }; // no churn
      if (msg.count === 0 && t.messageCount > 0) return { ok: true }; // page still loading
      await patchThread(msg.platformId, msg.threadId, {
        messageCount: msg.count,
        lastMessage: last ? { ...last, at: Date.now() } : t.lastMessage,
      });
      return { ok: true };
    }
    case 'MERGE_TO_MAIN': await mergeToMain(msg); return { ok: true };
    case 'MARK_MERGED': await patchThread(msg.platformId, msg.threadId, { mergedAt: Date.now() }); return { ok: true };
    case 'DELETE_THREAD': await removeThread(msg); return { ok: true };
    case 'DISMISS_ORPHAN': await removeOrphan(msg.platformId, msg.orphanId); return { ok: true };
    case 'JOB_RESULT':
      await settleJob(msg.jobId, msg.ok ? { ok: true } : { ok: false, error: msg.error ?? 'Unknown error.' });
      return { ok: true };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse, (e) =>
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name.startsWith('job:')) settleJob(a.name.slice(4), { ok: false, error: 'Timed out while deleting the chat.' });
  });

  // Reliable binding: the moment a thread's window navigates to a real conversation URL, remember it.
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const url = changeInfo.url ?? (changeInfo.status === 'complete' ? tab.url : undefined);
    if (!url) return;
    const platformId = detectPlatform(url);
    if (!platformId || !conversationKey(platformId, url)) return;
    const threadId = (await session.get(bindKey(tabId)))[bindKey(tabId)] as string | undefined;
    if (threadId) await bindThread(platformId, threadId, url, tabId);
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    const job = Object.values(await readJobs()).find((j) => j.tabId === tabId);
    if (job) settleJob(job.id, { ok: false, error: 'The tab was closed before the chat was deleted.' });
    await session.remove([bindKey(tabId), injKey(tabId)]);
  });

  recover();
});
