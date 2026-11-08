import { logoUrl } from '@/lib/assets';
import { ago, snip } from '@/lib/format';
import type { Thread } from '@/lib/types';

export interface MarkerProps {
  thread: Thread;
  afterText: string;
  beforeText?: string;
  dark: boolean;
  onOpen: () => void;
  onSeeAll: () => void;
}

const ThreadGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M10 4 7 20M17 4l-3 16M4 9h17M3 15h17" />
  </svg>
);

/** Discord-style "thread started here" card, placed in the chat exactly where the thread was created. */
export function ThreadMarker({ thread, afterText, beforeText, dark, onOpen, onSeeAll }: MarkerProps) {
  const started = !!thread.conversationUrl;
  const last = thread.lastMessage;
  const deleting = thread.status === 'deleting';
  const n = thread.messageCount;

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="font-sans text-[14px] leading-5 text-neutral-900 dark:text-neutral-100">
        <div className={`relative pl-11 ${deleting ? 'opacity-50' : ''}`}>
          <span className="absolute left-0.5 top-0 text-neutral-400 dark:text-neutral-500"><ThreadGlyph /></span>

          <p className="text-[13.5px]">
            <span className="font-semibold text-teal-700 dark:text-teal-400">You</span>
            <span className="text-neutral-500 dark:text-neutral-400"> started a thread: </span>
            <button onClick={onOpen} className="font-semibold hover:underline">{thread.title}</button>
            <span className="text-neutral-500 dark:text-neutral-400">. </span>
            <button onClick={onSeeAll} className="text-sky-600 hover:underline dark:text-sky-400">See all threads</button>
            <span className="text-[12px] text-neutral-500 dark:text-neutral-400">. {new Date(thread.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </p>

          <div className="relative mt-2">
            {/* L-shaped connector, like Discord */}
            <span className="absolute -left-[30px] -top-3 h-[calc(50%+12px)] w-[26px] rounded-bl-xl border-b-2 border-l-2 border-neutral-300 dark:border-neutral-700" />

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-[#0d0d0f]">
              <div className="flex items-center gap-2">
                <button onClick={onOpen} className="truncate text-[14px] font-semibold hover:underline">{thread.title}</button>
                <button onClick={onOpen} className="shrink-0 text-[12.5px] font-medium text-sky-600 hover:underline dark:text-sky-400">
                  {started ? `${n} ${n === 1 ? 'Message' : 'Messages'} ›` : 'Open ›'}
                </button>
                {thread.mergedAt && (
                  <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Merged
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-[13px] text-neutral-600 dark:text-neutral-300">
                <img src={logoUrl()} alt="" className="h-5 w-5 shrink-0 rounded-full" draggable={false} />
                {deleting ? (
                  <span className="truncate">Deleting thread and its chat…</span>
                ) : last ? (
                  <>
                    <span className="shrink-0 font-semibold">{last.role === 'user' ? 'You' : 'AI'}</span>
                    <span className="truncate">{snip(last.text, 120)}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-neutral-500">{ago(last.at)}</span>
                  </>
                ) : (
                  <span className="truncate text-neutral-500">{started ? 'No messages yet.' : 'Waiting for your first message in the thread window.'}</span>
                )}
              </div>

              <div className="mt-2.5 space-y-0.5 border-t border-neutral-200 pt-2 text-[12px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <p className="truncate"><span className="font-medium">Branched after:</span> “{snip(afterText)}”</p>
                <p className="truncate"><span className="font-medium">Before:</span> {beforeText ? `“${snip(beforeText)}”` : 'nothing yet (latest point of the chat)'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
