/** How backups read on the console: their size, and the night in their name. */

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** `2026-10-04_0200` → `4 Oct 2026, 2:00 AM`, in the server's time as the name was written. */
export function stampLabel(stamp: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return stamp;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const hour = Number(h) % 12 || 12;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${hour}:${mi} ${Number(h) < 12 ? 'AM' : 'PM'}`;
}

/** `dawai-2026-10-04_0200.archive.gz` → `2026-10-04_0200`. */
export const stampOf = (name: string) => name.replace(/^(dawai|uploads)-/, '').replace(/\.(archive\.gz|tgz)$/, '');
