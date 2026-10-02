/**
 * When someone was last here, to the minute: "today, 12:04 PM",
 * "yesterday, 9:15 PM", or "1 Oct 2026, 4:34 AM".
 *
 * A date alone hid whether a shop had been in this morning or at midnight,
 * which is the question "last seen" is asked to answer. Today and yesterday
 * go by the calendar, not by a 24-hour distance.
 */
export function lastSeen(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return `today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `yesterday, ${time}`;
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date}, ${time}`;
}
