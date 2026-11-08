import type { PlatformId } from './platforms';

/** The exact spot in the parent chat where the thread was started. */
export interface Anchor {
  /** Index of the message the thread comes AFTER (informational; text is the real key). */
  index: number;
  role: 'user' | 'assistant';
  /** Normalised first ~160 chars of that message. */
  text: string;
}

export interface Thread {
  id: string;
  /** Strict platform isolation. */
  platformId: PlatformId;
  title: string;
  status: 'active' | 'deleting';
  /** The chat this thread was created in. Threads are shown ONLY inside this chat. */
  parentUrl: string;
  parentKey: string;
  anchor: Anchor;
  /** The thread's own chat; set after the first message is sent in it. */
  conversationUrl?: string;
  conversationKey?: string;
  messageCount: number;
  lastMessage?: { role: 'user' | 'assistant'; text: string; at: number };
  /** Set when the thread's last reply was merged back into the main chat. */
  mergedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** A thread whose own chat could not be auto-deleted. The thread record is gone; the user is told. */
export interface Orphan {
  id: string;
  platformId: PlatformId;
  parentKey: string;
  title: string;
  url?: string;
  reason: string;
  at: number;
}
