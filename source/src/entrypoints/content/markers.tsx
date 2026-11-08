import ReactDOM from 'react-dom/client';
import type { MessageNode, PlatformAdapter } from '@/adapters';
import { norm } from '@/lib/format';
import type { Anchor, Thread } from '@/lib/types';
import { ThreadMarker } from './Marker';
import css from './style.css?inline';

interface Entry { host: HTMLElement; root: ReactDOM.Root; key: string }
interface Handlers { onOpen: (t: Thread) => void; onSeeAll: () => void }

/** Find the message a thread was anchored to: same role + text, nearest to the remembered index. */
function locate(nodes: MessageNode[], a: Anchor) {
  let best = -1;
  nodes.forEach((n, i) => {
    if (n.role === a.role && norm(n.text).slice(0, 160) === a.text && (best < 0 || Math.abs(i - a.index) < Math.abs(best - a.index))) best = i;
  });
  return best;
}

/** Climb to the outermost wrapper that still holds only this one message (so the box sits right after it). */
function turnRoot(el: HTMLElement, nodes: MessageNode[], input: HTMLElement | null) {
  let cur = el;
  for (let i = 0; i < 6; i++) {
    const p = cur.parentElement;
    if (!p || p === document.body || (input && p.contains(input))) break;
    if (nodes.filter((n) => p.contains(n.el)).length !== 1) break;
    cur = p;
  }
  return cur;
}

/**
 * Keeps one Discord-style box per thread of the CURRENT chat, inserted right after the anchor message.
 * Hosts are re-inserted whenever the site re-renders; threads of other chats are never passed in.
 */
export class MarkerManager {
  private entries = new Map<string, Entry>();
  private threads: Thread[] = [];
  private dark = false;
  private timer?: number;
  private mo: MutationObserver;
  private iv: number;

  constructor(private adapter: PlatformAdapter, private h: Handlers) {
    this.mo = new MutationObserver(() => this.schedule());
    this.mo.observe(document.body, { childList: true, subtree: true });
    this.iv = window.setInterval(() => this.sync(), 2000);
  }

  update(threads: Thread[], dark: boolean) {
    this.threads = threads;
    this.dark = dark;
    this.sync();
  }

  destroy() {
    this.mo.disconnect();
    clearInterval(this.iv);
    clearTimeout(this.timer);
    this.entries.forEach((e) => this.drop(e));
    this.entries.clear();
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.sync(), 250);
  }

  private drop(e: Entry) {
    e.root.unmount();
    e.host.remove();
  }

  private makeEntry(): Entry {
    const host = document.createElement('div');
    host.style.cssText = 'display:block;width:100%;max-width:768px;margin:10px auto;padding:0 16px;box-sizing:border-box;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    shadow.append(style, mount);
    return { host, root: ReactDOM.createRoot(mount), key: '' };
  }

  private sync() {
    const nodes = this.threads.length ? this.adapter.getMessageNodes() : [];
    const input = this.adapter.getInputBox();
    const seen = new Set<string>();
    const lastAfter = new Map<Element, Element>(); // several threads on one message stack in order

    for (const t of this.threads) {
      const i = locate(nodes, t.anchor);
      if (i < 0) continue; // anchor message not mounted (scrolled out / other layout): show nothing
      seen.add(t.id);

      let e = this.entries.get(t.id);
      if (!e) { e = this.makeEntry(); this.entries.set(t.id, e); }

      const root = turnRoot(nodes[i].el, nodes, input);
      const after = lastAfter.get(root) ?? root;
      if (after.nextElementSibling !== e.host) after.insertAdjacentElement('afterend', e.host);
      lastAfter.set(root, e.host);

      const props = { thread: t, afterText: nodes[i].text, beforeText: nodes[i + 1]?.text, dark: this.dark };
      const key = JSON.stringify([props.thread, props.afterText.slice(0, 160), props.beforeText?.slice(0, 160), props.dark]);
      if (key !== e.key) {
        e.key = key;
        e.root.render(<ThreadMarker {...props} onOpen={() => this.h.onOpen(t)} onSeeAll={this.h.onSeeAll} />);
      }
    }

    for (const [id, e] of this.entries) {
      if (!seen.has(id)) { this.drop(e); this.entries.delete(id); }
    }
  }
}
