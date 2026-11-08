import { BaseAdapter, type DeleteFlow, type Selectors } from './base';

// VERIFY against the live DOM; claude.ai changes markup often.
export class ClaudeAdapter extends BaseAdapter {
  readonly platformId = 'claude' as const;

  protected readonly selectors: Selectors = {
    input: ['div[contenteditable="true"][data-testid="chat-input"]', 'div.ProseMirror[contenteditable="true"]'],
    user: ['[data-testid="user-message"]'],
    assistant: ['.font-claude-response'], // class-based: the most fragile selector here
  };

  protected readonly deleteFlow: DeleteFlow = {
    trigger: ['[data-testid="chat-menu-trigger"]'],
    menuItem: ['[data-testid="delete-chat-trigger"]'],
    confirm: ['[data-testid="delete-modal-confirm"]'],
  };
}
