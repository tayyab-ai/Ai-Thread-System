import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlatformAdapter } from '@/adapters';
import { logoUrl } from '@/lib/assets';
import { ago, norm } from '@/lib/format';
import { send, type Reply } from '@/lib/messages';
import { PLATFORMS, conversationKey, type PlatformId } from '@/lib/platforms';
import { subscribeOrphans, subscribeThreads } from '@/lib/store';
import type { Orphan, Thread } from '@/lib/types';
import { MarkerManager } from './markers';
import { useTheme } from './theme';

// ── hooks ──
function useStore<T>(subscribe: (p: PlatformId, cb: (l: T[]) => void) => () => void, platformId: PlatformId) {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => subscribe(platformId, setList), [platformId]);
  return list;
}

function useHref() {
  const [href, setHref] = useState(location.href);
  useEffect(() => {
    const i = setInterval(() => setHref((p) => (p === location.href ? p : location.href)), 600);
    return () => clearInterval(i);
  }, []);
  return href;
}

// ── styles ──
const btn =
  'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-40';
const ghost = `${btn} text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`;
const solid = `${btn} bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-neutral-950 dark:hover:bg-teal-400`;
const danger = `${btn} bg-red-600 text-white hover:bg-red-700`;

const SunMoon = ({ dark }: { dark: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {dark ? (
      <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
    ) : (
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    )}
  </svg>
);

const Merged = () => (
  <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">✓ Merged</span>
);

function ThreadRow({ t, onOpen, onDelete }: { t: Thread; onOpen: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const deleting = t.status === 'deleting';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className={`rounded-xl border border-neutral-200 px-3.5 py-3 dark:border-neutral-800 ${deleting ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium">{t.title}</span>
            {t.mergedAt && <Merged />}
          </p>
          <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            {deleting
              ? 'Deleting thread and its chat…'
              : !t.conversationUrl
                ? 'Not started: send a message in its window'
                : `${t.messageCount} ${t.messageCount === 1 ? 'message' : 'messages'} · ${ago(t.lastMessage?.at ?? t.updatedAt)}`}
          </p>
        </div>
        {!deleting && !confirming && (
          <div className="flex shrink-0 gap-1">
            <button className={solid} onClick={onOpen}>Open</button>
            <button className={ghost} onClick={() => setConfirming(true)} aria-label={`Delete ${t.title}`}>Delete</button>
          </div>
        )}
      </div>
      {confirming && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-[12px] text-red-600 dark:text-red-400">Delete this thread and its chat?</p>
          <div className="flex gap-1">
            <button className={ghost} onClick={() => setConfirming(false)}>Cancel</button>
            <button className={danger} onClick={() => { setConfirming(false); onDelete(); }}>Delete</button>
          </div>
        </div>
      )}
    </motion.li>
  );
}

// ── app ──
export function App({ platformId, adapter }: { platformId: PlatformId; adapter: PlatformAdapter }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmActiveDel, setConfirmActiveDel] = useState(false);

  const all = useStore<Thread>(subscribeThreads, platformId);
  const orphans = useStore<Orphan>(subscribeOrphans, platformId);
  const href = useHref();
  const { dark, toggle } = useTheme();
  const label = PLATFORMS[platformId].label;

  const key = conversationKey(platformId, href);
  /** Per-chat isolation: only threads created in THIS chat. */
  const here = useMemo(() => (key ? all.filter((t) => t.parentKey === key) : []), [all, key]);
  /** Set when this tab is itself a thread's chat. */
  const active = useMemo(() => (key ? all.find((t) => t.conversationKey === key) : undefined), [all, key]);
  const notices = useMemo(() => (key ? orphans.filter((o) => o.parentKey === key) : []), [orphans, key]);

  // inline Discord-style boxes inside the chat
  const mgr = useRef<MarkerManager | undefined>(undefined);
  useEffect(() => {
    const m = new MarkerManager(adapter, {
      onOpen: (t) => { send({ type: 'OPEN_THREAD', platformId, threadId: t.id }); },
      onSeeAll: () => setOpen(true),
    });
    mgr.current = m;
    return () => m.destroy();
  }, [adapter, platformId]);
  useEffect(() => { mgr.current?.update(here, dark); }, [here, dark, href]);

  // keep the card's "N messages / last message" live while the user chats inside a thread
  useEffect(() => {
    if (!active) return;
    let lastSig = '';
    const tick = () => {
      const msgs = adapter.getMessages();
      const l = msgs[msgs.length - 1];
      const sig = `${msgs.length}|${l?.text.slice(0, 200)}`;
      if (sig === lastSig) return;
      lastSig = sig;
      send({ type: 'THREAD_STATS', platformId, threadId: active.id, count: msgs.length, last: l && { role: l.role, text: l.text.slice(0, 200) } });
    };
    tick();
    const i = setInterval(tick, 2500);
    return () => clearInterval(i);
  }, [active?.id, adapter, platformId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const run = async (p: Promise<Reply>) => {
    const r = await p.catch((e) => ({ ok: false as const, error: String(e) }));
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  async function create() {
    setError(null);
    if (!key) { setError('Open a saved chat first: a thread needs a chat to branch from.'); return; }
    const msgs = adapter.getMessages();
    if (!msgs.length) { setError("Couldn't read any messages on this page. Send a message first."); return; }
    const last = msgs[msgs.length - 1];
    setBusy(true);
    const ok = await run(send({
      type: 'CREATE_THREAD',
      platformId,
      title: title.trim() || undefined,
      parentUrl: location.href,
      anchor: { index: msgs.length - 1, role: last.role, text: norm(last.text).slice(0, 160) },
    }));
    setBusy(false);
    if (ok) setTitle('');
  }

  async function merge() {
    if (!active) return;
    setError(null);
    const last = adapter.getMessages().filter((m) => m.role === 'assistant').at(-1);
    if (!last) { setError('There is no reply in this thread to merge yet.'); return; }
    await run(send({ type: 'MERGE_TO_MAIN', platformId, threadId: active.id, text: last.text }));
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="pointer-events-none fixed inset-0 z-[2147483647] font-sans text-[14px] leading-5 text-neutral-900 dark:text-neutral-100">
        <motion.button
          aria-label={`Open ${label} threads`}
          onClick={() => setOpen(true)}
          whileHover={{ x: -3 }}
          className="pointer-events-auto absolute right-0 top-[45%] flex items-center gap-1.5 rounded-l-xl border border-r-0 border-neutral-200 bg-white/90 py-2.5 pl-2.5 pr-2 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90"
        >
          <img src={logoUrl()} alt="" className="h-6 w-6" draggable={false} />
          {here.length > 0 && <span className="text-[12px] tabular-nums text-neutral-500">{here.length}</span>}
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.aside
              role="dialog"
              aria-label="Threads"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="pointer-events-auto absolute right-0 top-0 flex h-full w-[360px] max-w-[92vw] flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            >
              <header className="flex items-center justify-between px-4 pb-3 pt-4">
                <div className="flex items-center gap-2.5">
                  <img src={logoUrl()} alt="" className="h-7 w-7" draggable={false} />
                  <div>
                    <h2 className="text-[15px] font-semibold leading-5">Threads</h2>
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400">{label} · this chat only</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className={ghost} onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
                    <SunMoon dark={dark} />
                  </button>
                  <button className={ghost} onClick={() => setOpen(false)}>Close</button>
                </div>
              </header>

              {active && (
                <div className="mx-4 mb-3 rounded-xl bg-teal-50 p-3 dark:bg-teal-950/50">
                  <p className="flex items-center gap-2 text-[13px]">
                    <span className="truncate">You're in <span className="font-medium">{active.title}</span></span>
                    {active.mergedAt && <Merged />}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <button className={solid} onClick={merge}>{active.mergedAt ? 'Merge again' : 'Merge to main'}</button>
                    {!confirmActiveDel && <button className={ghost} onClick={() => setConfirmActiveDel(true)}>Delete thread</button>}
                  </div>
                  {confirmActiveDel && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[12px] text-red-600 dark:text-red-400">Delete this thread and its chat?</p>
                      <div className="flex gap-1">
                        <button className={ghost} onClick={() => setConfirmActiveDel(false)}>Cancel</button>
                        <button className={danger} onClick={() => { setConfirmActiveDel(false); run(send({ type: 'DELETE_THREAD', platformId, threadId: active.id })); }}>Delete</button>
                      </div>
                    </div>
                  )}
                  <p className="mt-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                    {active.mergedAt
                      ? `Merged ${ago(active.mergedAt)}: this thread's last reply was added to the main chat's message box (press send there to post it).`
                      : "Adds this thread's last reply to the main chat's message box. Nothing is sent."}
                  </p>
                </div>
              )}

              <div className="px-4 pb-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Name this thread (optional)"
                  className="mb-2 w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-[13px] placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-neutral-700"
                />
                <button className={`${solid} w-full py-2`} onClick={create} disabled={busy || !key}>
                  {busy ? 'Opening…' : 'New thread from this point'}
                </button>
                <p className="mt-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                  {key ? 'Opens an empty chat in a new window: no context is carried over.' : 'Open a saved chat to start a thread from it.'}
                </p>
                {error && <p role="alert" className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
              </div>

              {notices.map((o) => (
                <div key={o.id} role="alert" className="mx-4 mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <p><span className="font-semibold">“{o.title}”</span> was removed, but its chat couldn't be deleted automatically ({o.reason}). Delete it by hand from the site's chat list.</p>
                  <div className="mt-2 flex gap-1">
                    {o.url && <button className={ghost} onClick={() => window.open(o.url, '_blank')}>Open chat</button>}
                    <button className={ghost} onClick={() => send({ type: 'DISMISS_ORPHAN', platformId, orphanId: o.id })}>Dismiss</button>
                  </div>
                </div>
              ))}

              <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                <AnimatePresence initial={false}>
                  {here.map((t) => (
                    <ThreadRow
                      key={t.id}
                      t={t}
                      onOpen={() => run(send({ type: 'OPEN_THREAD', platformId, threadId: t.id }))}
                      onDelete={() => run(send({ type: 'DELETE_THREAD', platformId, threadId: t.id }))}
                    />
                  ))}
                </AnimatePresence>
                {here.length === 0 && (
                  <li className="px-1 pt-6 text-[13px] text-neutral-500 dark:text-neutral-400">
                    No threads in this chat yet. Branch off a side topic and keep this chat focused.
                  </li>
                )}
              </ul>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
