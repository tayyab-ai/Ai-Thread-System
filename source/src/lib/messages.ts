import { browser } from 'wxt/browser';
import type { PlatformId } from './platforms';
import type { Anchor } from './types';

export interface DeleteJob { id: string; platformId: PlatformId }

export type Msg =
  | { type: 'HELLO'; platformId: PlatformId }
  | { type: 'PING' }
  | { type: 'CREATE_THREAD'; platformId: PlatformId; title?: string; parentUrl: string; anchor: Anchor }
  | { type: 'OPEN_THREAD'; platformId: PlatformId; threadId: string }
  | { type: 'BIND_THREAD_URL'; platformId: PlatformId; threadId: string; url: string }
  | { type: 'THREAD_STATS'; platformId: PlatformId; threadId: string; count: number; last?: { role: 'user' | 'assistant'; text: string } }
  | { type: 'MERGE_TO_MAIN'; platformId: PlatformId; threadId: string; text: string }
  | { type: 'MARK_MERGED'; platformId: PlatformId; threadId: string }
  | { type: 'DELETE_THREAD'; platformId: PlatformId; threadId: string }
  | { type: 'DISMISS_ORPHAN'; platformId: PlatformId; orphanId: string }
  | { type: 'JOB_RESULT'; jobId: string; ok: boolean; error?: string };

export type HelloReply =
  | { role: 'normal' }
  | { role: 'deleter'; job: DeleteJob }
  | { role: 'bind'; threadId: string }
  | { role: 'inject'; text: string; mergeThreadId?: string };

export type Reply = { ok: true } | { ok: false; error: string };

export const send = <R = Reply>(msg: Msg): Promise<R> => browser.runtime.sendMessage(msg) as Promise<R>;
