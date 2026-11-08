import { BaseAdapter, type ChatMessage, type DeleteFlow, type MessageNode, type Selectors } from './base';

/**
 * ChatGPT changed its DOM in Sep/Oct 2026 (old data-message-author-role wrappers can be absent).
 * NEW hooks first, legacy ones kept as fallback.
 */
export class ChatGPTAdapter extends BaseAdapter {
  readonly platformId = 'chatgpt' as const;

  protected readonly selectors: Selectors = {
    input: [
      '[data-composer-input] [contenteditable="true"]',
      '[data-composer-input][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
    ],
    user: ['[data-user-message-bubble]', '[data-message-author-role="user"]'],
    assistant: ['[data-markdown-text-style="assistant-message"]', '[data-message-author-role="assistant"]'],
  };

  // VERIFY: test-ids as of the last time we looked; generic text matching covers the rest.
  protected readonly deleteFlow: DeleteFlow = {
    trigger: ['[data-testid="conversation-options-button"]', 'button[aria-label="Open conversation options"]'],
    menuItem: ['[data-testid="delete-chat-menu-item"]'],
    confirm: ['[data-testid="delete-conversation-confirm-button"]'],
  };

  protected extractText(el: HTMLElement) {
    const body = el.querySelector<HTMLElement>('.markdown') ?? el;
    return (body.innerText || body.textContent || '').trim();
  }

  getMessageNodes(): MessageNode[] {
    const nodes = super.getMessageNodes();
    if (nodes.length) return nodes;
    // Last resort: whole turn containers.
    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-turn-key], [data-turn-id], article[data-testid^="conversation-turn"]'),
    )
      .map((el) => ({
        el,
        role: (el.querySelector('[data-user-message-bubble], [data-message-author-role="user"]') ? 'user' : 'assistant') as ChatMessage['role'],
        text: this.extractText(el),
      }))
      .filter((m) => m.text);
  }
}
