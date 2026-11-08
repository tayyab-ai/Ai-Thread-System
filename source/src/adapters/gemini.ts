import { BaseAdapter, type DeleteFlow, type Selectors } from './base';

// VERIFY: Gemini uses custom elements (user-query, model-response) as its most stable hooks.
export class GeminiAdapter extends BaseAdapter {
  readonly platformId = 'gemini' as const;

  protected readonly selectors: Selectors = {
    input: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]'],
    user: ['user-query'],
    assistant: ['model-response message-content'],
  };

  protected readonly deleteFlow: DeleteFlow = {
    trigger: ['[data-test-id="actions-menu-button"]'],
    menuItem: ['[data-test-id="delete-button"]'],
    confirm: ['[data-test-id="confirm-button"]'],
  };
}
