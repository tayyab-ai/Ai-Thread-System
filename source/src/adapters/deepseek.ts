import { BaseAdapter, type DeleteFlow, type Selectors } from './base';

/**
 * DeepSeek ships hashed class names and no data-attributes, so this is BEST EFFORT.
 * Deleting relies entirely on the generic flow: sidebar row "…" → "Delete" → confirm.
 * User-message selector is still a TODO (no stable hook), so DeepSeek boxes can only anchor on
 * assistant replies.
 */
export class DeepSeekAdapter extends BaseAdapter {
  readonly platformId = 'deepseek' as const;

  protected readonly selectors: Selectors = {
    input: ['textarea#chat-input', 'textarea'],
    user: [],
    assistant: ['.ds-markdown'],
  };

  protected readonly deleteFlow: DeleteFlow = { trigger: [], menuItem: [], confirm: [] };
}
