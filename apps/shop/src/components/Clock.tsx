import { useEffect, useState } from 'react';
import { useUiLang, bnNumerals } from '../i18n/ui';

const TZ = 'Asia/Dhaka';

/** "Sun, 4 Oct 2026" and "10:05 PM" — or in Bangla, "রবি, ৪ অক্টো ২০২৬" and "১০:০৫ পিএম". */
export function clockParts(now: Date, lang: 'en' | 'bn') {
  const date = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(now)
    .replace(/,(?=\s*\S+$)/, '');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const pm = get('dayPeriod').toUpperCase() === 'PM';
  const time = `${get('hour')}:${get('minute')}`;
  return lang === 'bn' ? { date, time: `${bnNumerals(time)} ${pm ? 'পিএম' : 'এএম'}` } : { date, time: `${time} ${pm ? 'PM' : 'AM'}` };
}

/**
 * Today's date and the time, in the shop's own time (Dhaka), 12-hour with AM
 * or PM — in the top bar of the app and of the POS, where a cashier glances
 * when writing a date on a slip or telling a customer "we close at nine".
 */
export default function Clock({ className = '' }: { className?: string }) {
  const lang = useUiLang();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Ticks on the minute, not every second: a top bar that never stops moving is a distraction.
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    id = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(id);
  }, []);
  const { date, time } = clockParts(now, lang === 'bn' ? 'bn' : 'en');
  return (
    <time dateTime={now.toISOString()} className={`flex flex-col items-end leading-tight tabular-nums ${className}`} title={`${date}, ${time}`}>
      <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">{time}</span>
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">{date}</span>
    </time>
  );
}
