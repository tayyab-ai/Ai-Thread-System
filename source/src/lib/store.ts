/**
 * Storage with strict platform isolation (chrome.storage.local; content scripts live in the page's
 * origin, so IndexedDB there would be the AI site's DB, not ours).
 * One key per platform + every API takes a platformId + every read re-filters on platformId.
 * Per-CHAT isolation is applied on top by the UI: a thread is shown only where thread.parentKey matches.
 */
import { browser } from 'wxt/browser';
import type { PlatformId } from './platforms';
import type { Orphan, Thread } from './types';

const tKey = (p: PlatformId) => `threads:${p}`;
const oKey = (p: PlatformId) => `orphans:${p}`;

let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
};

async function read<T extends { platformId: PlatformId }>(key: string, p: PlatformId): Promise<T[]> {
  const res = await browser.storage.local.get(key);
  return ((res[key] as T[] | undefined) ?? []).filter((x) => x.platformId === p);
}
const write = (key: string, list: unknown[]) => browser.storage.local.set({ [key]: list });

function subscribe<T extends { platformId: PlatformId }>(key: string, p: PlatformId, cb: (l: T[]) => void) {
  let alive = true;
  const push = () => read<T>(key, p).then((l) => alive && cb(l));
  push();
  const handler = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && key in changes) push();
  };
  browser.storage.onChanged.addListener(handler as never);
  return () => {
    alive = false;
    browser.storage.onChanged.removeListener(handler as never);
  };
}

// ── threads ──
export const listThreads = async (p: PlatformId) =>
  (await read<Thread>(tKey(p), p)).sort((a, b) => b.createdAt - a.createdAt);

export const getThread = async (p: PlatformId, id: string) =>
  (await read<Thread>(tKey(p), p)).find((t) => t.id === id);

export const putThread = (t: Thread) =>
  serial(async () => {
    const list = await read<Thread>(tKey(t.platformId), t.platformId);
    const i = list.findIndex((x) => x.id === t.id);
    if (i >= 0) list[i] = t; else list.push(t);
    await write(tKey(t.platformId), list);
  });

export const patchThread = (p: PlatformId, id: string, patch: Partial<Thread>) =>
  serial(async () => {
    const list = await read<Thread>(tKey(p), p);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list[i] = { ...list[i], ...patch, platformId: p, updatedAt: Date.now() };
    await write(tKey(p), list);
  });

export const deleteThread = (p: PlatformId, id: string) =>
  serial(async () => write(tKey(p), (await read<Thread>(tKey(p), p)).filter((t) => t.id !== id)));

export const subscribeThreads = (p: PlatformId, cb: (t: Thread[]) => void) => subscribe<Thread>(tKey(p), p, cb);

// ── orphans (chats we failed to auto-delete) ──
export const addOrphan = (o: Orphan) =>
  serial(async () => write(oKey(o.platformId), [...(await read<Orphan>(oKey(o.platformId), o.platformId)), o]));

export const removeOrphan = (p: PlatformId, id: string) =>
  serial(async () => write(oKey(p), (await read<Orphan>(oKey(p), p)).filter((o) => o.id !== id)));

export const subscribeOrphans = (p: PlatformId, cb: (o: Orphan[]) => void) => subscribe<Orphan>(oKey(p), p, cb);
