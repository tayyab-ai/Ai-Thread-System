import { defineConfig } from 'wxt';
import { PLATFORM_HOST_PERMISSIONS, PLATFORM_MATCHES } from './src/lib/platforms';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Threads & Branches',
    description: 'Branch off-topic tangents from your AI chats without cluttering the main conversation.',
    minimum_chrome_version: '116',
    // No `tabs` permission needed: host permissions already expose tab.url for these sites.
    permissions: ['storage', 'unlimitedStorage', 'alarms'],
    host_permissions: PLATFORM_HOST_PERMISSIONS,
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 96: 'icon/96.png', 128: 'icon/128.png' },
    // Lets the in-page edge tab load the logo from the extension.
    web_accessible_resources: [{ resources: ['icon/*.png'], matches: PLATFORM_MATCHES }],
  },
});
