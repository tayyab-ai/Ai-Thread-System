export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'deepseek';

export interface PlatformConfig {
  id: PlatformId;
  label: string;
  hosts: string[];
  /** Where a user-facing thread starts (a normal, saved chat so it gets a URL). */
  newChatUrl: string;
  /** Matches a URL path that points at a specific saved conversation. */
  conversationPath: RegExp;
}

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    newChatUrl: 'https://chatgpt.com/',
    conversationPath: /\/c\/[\w-]+/,
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    newChatUrl: 'https://claude.ai/new',
    conversationPath: /\/chat\/[\w-]+/,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    newChatUrl: 'https://gemini.google.com/app',
    conversationPath: /\/app\/[\w-]+/,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    newChatUrl: 'https://chat.deepseek.com/',
    conversationPath: /\/a\/chat\/s\/[\w-]+/,
  },
};

const allHosts = Object.values(PLATFORMS).flatMap((p) => p.hosts);
export const PLATFORM_MATCHES = allHosts.map((h) => `https://${h}/*`);
export const PLATFORM_HOST_PERMISSIONS = PLATFORM_MATCHES;

/** The ONLY place a URL is mapped to a platform. Everything downstream is keyed by this id. */
export function detectPlatform(url: string): PlatformId | null {
  try {
    const { hostname } = new URL(url);
    return (Object.values(PLATFORMS).find((p) => p.hosts.includes(hostname))?.id) ?? null;
  } catch {
    return null;
  }
}

export const isConversationUrl = (id: PlatformId, url: string) =>
  PLATFORMS[id].conversationPath.test(new URL(url).pathname);

export const samePath = (a: string, b: string) => {
  try {
    const A = new URL(a), B = new URL(b);
    return A.origin === B.origin && A.pathname === B.pathname;
  } catch {
    return false;
  }
};

/** Stable id of a saved conversation (e.g. "/c/abc123"), or null on new-chat / home pages. */
export function conversationKey(id: PlatformId, url: string): string | null {
  try {
    const m = new URL(url).pathname.match(PLATFORMS[id].conversationPath);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}
