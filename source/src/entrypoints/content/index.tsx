import './style.css';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createAdapter } from '@/adapters';
import { send, type HelloReply } from '@/lib/messages';
import { PLATFORM_MATCHES, detectPlatform, isConversationUrl, type PlatformId } from '@/lib/platforms';
import { App } from './App';
import { performDelete } from './deleter';

/** Fallback binder (the background's tabs.onUpdated is the primary one): first real conversation URL wins. */
function startBinding(platformId: PlatformId, threadId: string) {
  const deadline = Date.now() + 30 * 60_000;
  const iv = setInterval(async () => {
    if (Date.now() > deadline) return clearInterval(iv);
    if (!isConversationUrl(platformId, location.href)) return;
    clearInterval(iv);
    await send({ type: 'BIND_THREAD_URL', platformId, threadId, url: location.href });
  }, 1000);
}

export default defineContentScript({
  matches: PLATFORM_MATCHES,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    if (window.top !== window) return;
    const platformId = detectPlatform(location.href);
    if (!platformId) return;

    const hello = await send<HelloReply>({ type: 'HELLO', platformId }).catch((): HelloReply => ({ role: 'normal' }));
    const adapter = createAdapter(platformId);

    // Tab opened by us only to delete a thread's chat: do it, never mount UI.
    if (hello.role === 'deleter') {
      await performDelete(adapter, hello.job.id);
      return;
    }

    browser.runtime.onMessage.addListener((msg: { type?: string; text?: string; jobId?: string }, _s, sendResponse) => {
      if (msg?.type === 'INJECT_TEXT' && msg.text) { // merge into this (main) chat's input, never sent
        adapter.injectText(msg.text, 'append').then(
          () => sendResponse({ ok: true }),
          (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
        return true;
      }
      if (msg?.type === 'RUN_DELETE' && msg.jobId) { // this tab is the thread's chat and is being deleted
        sendResponse({ ok: true });
        performDelete(adapter, msg.jobId);
      }
      return undefined;
    });

    if (hello.role === 'inject') {
      adapter.waitUntilReady(20_000)
        .then(() => adapter.injectText(hello.text, 'append'))
        .then(() => { if (hello.mergeThreadId) return send({ type: 'MARK_MERGED', platformId, threadId: hello.mergeThreadId }); })
        .catch(console.error);
    }
    if (hello.role === 'bind') startBinding(platformId, hello.threadId);

    const ui = await createShadowRootUi(ctx, {
      name: 'ai-threads-ui',
      position: 'inline',
      anchor: 'body',
      isolateEvents: ['keydown', 'keyup', 'keypress'],
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<App platformId={platformId} adapter={adapter} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
