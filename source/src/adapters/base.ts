import { norm } from '@/lib/format';
import type { PlatformId } from '@/lib/platforms';

export interface ChatMessage { role: 'user' | 'assistant'; text: string }
export interface MessageNode extends ChatMessage { el: HTMLElement }

export interface PlatformAdapter {
  readonly platformId: PlatformId;
  getMessages(): ChatMessage[];
  /** Same as getMessages but with the DOM element of each message (used to place the thread box). */
  getMessageNodes(): MessageNode[];
  getInputBox(): HTMLElement | null;
  injectText(text: string, mode?: 'replace' | 'append'): Promise<void>;
  waitUntilReady(timeoutMs?: number): Promise<void>;
  /** Deletes the conversation currently open in this tab, via the site's own UI. */
  deleteCurrentConversation(): Promise<void>;
}

export type AdapterErrorCode = 'NOT_READY' | 'NO_INPUT' | 'DELETE_FAILED' | 'TIMEOUT';
export class AdapterError extends Error {
  constructor(public code: AdapterErrorCode, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve when `probe` is truthy. MutationObserver for speed + interval fallback (throttled tabs). */
export function waitFor<T>(probe: () => T | null | undefined | false, timeoutMs: number, label = 'condition'): Promise<T> {
  return new Promise((resolve, reject) => {
    const mo = new MutationObserver(() => check());
    const iv = setInterval(() => check(), 400);
    const to = setTimeout(() => {
      cleanup();
      reject(new AdapterError('TIMEOUT', `Timed out waiting for ${label}.`));
    }, timeoutMs);
    const cleanup = () => { mo.disconnect(); clearInterval(iv); clearTimeout(to); };
    const check = () => {
      const v = probe();
      if (v) { cleanup(); resolve(v as T); }
    };
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    check();
  });
}

const isVisible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function findByText(re: RegExp, selector: string, root: ParentNode = document): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
      (el) => isVisible(el) && re.test((el.innerText || el.textContent || '').trim()),
    ) ?? null
  );
}

/** Radix/React menus open on pointerdown, so a bare .click() often does nothing. Send the full sequence. */
export function realClick(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const base = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  const ptr = { ...base, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerover', ptr));
  el.dispatchEvent(new PointerEvent('pointerdown', { ...ptr, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  el.focus?.();
  el.dispatchEvent(new PointerEvent('pointerup', ptr));
  el.dispatchEvent(new MouseEvent('mouseup', base));
  el.dispatchEvent(new MouseEvent('click', base));
}

export interface Selectors { input: string[]; user: string[]; assistant: string[] }
/** Site-specific hooks for deleting a chat. Anything missing falls back to generic text matching. */
export interface DeleteFlow { trigger: string[]; menuItem: string[]; confirm: string[] }

const DELETE_RE = /^\s*delete( chat| conversation)?\s*$/i;
const MENU_ITEMS = '[role="menuitem"],[role="option"],button,[role="button"],li,a,div[tabindex]';
const DIALOGS = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"]';

export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platformId: PlatformId;
  protected abstract readonly selectors: Selectors;
  protected abstract readonly deleteFlow: DeleteFlow;

  protected first<T extends HTMLElement = HTMLElement>(sels: string[], root: ParentNode = document): T | null {
    for (const s of sels) {
      const el = root.querySelector<T>(s);
      if (el) return el;
    }
    return null;
  }

  getInputBox() { return this.first(this.selectors.input); }

  protected extractText(el: HTMLElement) {
    return (el.innerText || el.textContent || '').trim();
  }

  getMessageNodes(): MessageNode[] {
    const { user, assistant } = this.selectors;
    const all = [...user, ...assistant];
    if (!all.length) return [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(all.join(',')));
    // Drop nodes nested inside another matched node so a turn is not counted twice.
    const unique = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)));
    return unique
      .map((el) => ({
        el,
        role: (user.some((s) => el.matches(s)) ? 'user' : 'assistant') as ChatMessage['role'],
        text: this.extractText(el),
      }))
      .filter((m) => m.text);
  }

  getMessages(): ChatMessage[] {
    return this.getMessageNodes().map(({ role, text }) => ({ role, text }));
  }

  async waitUntilReady(timeoutMs = 30_000) {
    try {
      await waitFor(() => this.getInputBox(), timeoutMs, 'the chat input');
    } catch {
      throw new AdapterError('NOT_READY', 'The chat page never finished loading. Make sure you are signed in.');
    }
  }

  async injectText(text: string, mode: 'replace' | 'append' = 'replace') {
    const box = await waitFor(() => this.getInputBox(), 15_000, 'the chat input');
    box.focus();

    if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
      const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      setter.call(box, mode === 'append' && box.value ? `${box.value}\n\n${text}` : text); // bypass React's value tracker
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    if (mode === 'append') range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const probe = norm(text).slice(0, 40);
    const has = () => norm(box.textContent ?? '').includes(probe);

    document.execCommand('insertText', false, text);
    if (!has()) {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    await sleep(50);
    if (!has()) throw new AdapterError('NO_INPUT', 'Could not write into the chat input.');
  }

  /** Sidebar row of the open chat → its "…" button (the last button in/next to the row). */
  protected findSidebarTrigger(convId: string): HTMLElement | null {
    if (convId) {
      const link = document.querySelector<HTMLElement>(`a[href*="${convId}"]`);
      for (const scope of [link, link?.parentElement]) {
        const btns = scope ? Array.from(scope.querySelectorAll<HTMLElement>('button,[role="button"]')) : [];
        if (btns.length) return btns[btns.length - 1];
      }
    }
    return document.querySelector<HTMLElement>(
      'button[aria-label*="conversation options" i],button[aria-label*="chat options" i],button[aria-label*="more options" i]',
    );
  }

  protected findMenuDelete() {
    return this.first(this.deleteFlow.menuItem) ?? findByText(DELETE_RE, MENU_ITEMS);
  }

  protected findConfirm() {
    const direct = this.first(this.deleteFlow.confirm);
    if (direct) return direct;
    for (const d of Array.from(document.querySelectorAll<HTMLElement>(DIALOGS))) {
      const b = findByText(DELETE_RE, 'button,[role="button"]', d);
      if (b) return b;
    }
    return null;
  }

  async deleteCurrentConversation() {
    const startPath = location.pathname;
    const convId = startPath.split('/').filter(Boolean).pop() ?? '';
    const hadLink = !!(convId && document.querySelector(`a[href*="${convId}"]`));
    const gone = () => location.pathname !== startPath || (hadLink && !document.querySelector(`a[href*="${convId}"]`));

    // 1 + 2: open the options menu and click "Delete" (retry once: menus sometimes ignore the first click)
    let item: HTMLElement | null = null;
    for (let attempt = 0; attempt < 2 && !item; attempt++) {
      const trigger = await waitFor(() => this.first(this.deleteFlow.trigger) ?? this.findSidebarTrigger(convId), 20_000, 'the chat options button');
      realClick(trigger);
      item = await waitFor(() => this.findMenuDelete(), 4_000, 'the Delete menu item').catch(() => null);
    }
    if (!item) throw new AdapterError('DELETE_FAILED', 'Could not find the Delete option in the chat menu.');
    realClick(item);

    // 3: confirm
    await sleep(300);
    const confirm = await waitFor(() => this.findConfirm(), 8_000, 'the delete confirmation').catch(() => null);
    if (confirm) realClick(confirm);

    // 4: verify
    await waitFor(gone, 12_000, 'the chat to disappear').catch(() => {
      throw new AdapterError('DELETE_FAILED', 'Clicked Delete but could not confirm the chat was removed.');
    });
  }
}
