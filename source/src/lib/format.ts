export const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
export const snip = (t: string, n = 90) => (norm(t).length > n ? `${norm(t).slice(0, n - 1)}…` : norm(t));

export const ago = (t: number) => {
  const s = Math.round((t - Date.now()) / 1000);
  const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(s) < 60) return 'just now';
  if (Math.abs(s) < 3600) return f.format(Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return f.format(Math.round(s / 3600), 'hour');
  return f.format(Math.round(s / 86400), 'day');
};
