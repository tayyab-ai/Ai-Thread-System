import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

type Pref = 'light' | 'dark' | null;
const KEY = 'theme';

const hostIsDark = () => {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
  if (!m) return false;
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

/** Follows the host page until the user flips the toggle; after that the explicit choice wins (and persists). */
export function useTheme() {
  const [pref, setPref] = useState<Pref>(null);
  const [host, setHost] = useState(hostIsDark);

  useEffect(() => {
    browser.storage.local.get(KEY).then((r) => setPref((r[KEY] as Pref) ?? null)).catch(() => undefined);
    const onChange = (c: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && KEY in c) setPref((c[KEY].newValue as Pref) ?? null);
    };
    browser.storage.onChanged.addListener(onChange as never);
    const iv = setInterval(() => setHost(hostIsDark()), 2000);
    return () => { browser.storage.onChanged.removeListener(onChange as never); clearInterval(iv); };
  }, []);

  const dark = pref ? pref === 'dark' : host;
  const toggle = () => browser.storage.local.set({ [KEY]: dark ? 'light' : 'dark' });
  return { dark, toggle };
}
