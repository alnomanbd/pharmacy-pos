import { describe, expect, it } from 'vitest';
import { clockParts } from './Clock';

describe('the top-bar clock', () => {
  it('is Dhaka time, 12-hour, with AM or PM', () => {
    // 18:05 UTC is 12:05 past midnight in Dhaka, the next day.
    expect(clockParts(new Date('2026-10-04T18:05:09Z'), 'en')).toEqual({ date: 'Mon, 5 Oct 2026', time: '12:05 AM' });
    expect(clockParts(new Date('2026-10-04T06:00:00Z'), 'en').time).toBe('12:00 PM');
    expect(clockParts(new Date('2026-10-04T15:30:00Z'), 'en').time).toBe('9:30 PM');
  });

  it('is all Bangla in Bangla', () => {
    const { date, time } = clockParts(new Date('2026-10-04T15:30:00Z'), 'bn');
    expect(time).toBe('৯:৩০ পিএম');
    expect(date).toMatch(/^রবি, ৪ অক্টো/);
    expect(date + time).not.toMatch(/[0-9]/);
  });
});
