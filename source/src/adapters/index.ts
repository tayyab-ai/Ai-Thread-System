import type { PlatformId } from '@/lib/platforms';
import type { PlatformAdapter } from './base';
import { ChatGPTAdapter } from './chatgpt';
import { ClaudeAdapter } from './claude';
import { DeepSeekAdapter } from './deepseek';
import { GeminiAdapter } from './gemini';

export function createAdapter(id: PlatformId): PlatformAdapter {
  switch (id) {
    case 'chatgpt': return new ChatGPTAdapter();
    case 'claude': return new ClaudeAdapter();
    case 'gemini': return new GeminiAdapter();
    case 'deepseek': return new DeepSeekAdapter();
  }
}
export type { PlatformAdapter, ChatMessage, MessageNode } from './base';
