import type { PlatformAdapter } from '@/adapters';
import { send } from '@/lib/messages';

/** Deletes the chat open in this tab, then reports back so the background can drop the thread record. */
export async function performDelete(adapter: PlatformAdapter, jobId: string) {
  const ping = setInterval(() => send({ type: 'PING' }).catch(() => undefined), 10_000);
  try {
    await adapter.waitUntilReady(30_000);
    await adapter.deleteCurrentConversation();
    await send({ type: 'JOB_RESULT', jobId, ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error while deleting the chat.';
    await send({ type: 'JOB_RESULT', jobId, ok: false, error }).catch(() => undefined);
  } finally {
    clearInterval(ping);
  }
}
