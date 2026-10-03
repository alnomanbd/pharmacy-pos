import { describe, it, expect } from 'vitest';
import { takingsMessage, stockMessage } from '../src/services/push.service.js';

describe('phone alerts', () => {
  it('says what the day came to, against yesterday', () => {
    expect(takingsMessage({ total: 12450, bills: 37 }, { total: 10000 })).toMatchObject({
      title: 'Today: ৳12,450',
      body: '37 bills · 25% up on yesterday. Tap for the day\'s report.',
      url: '/reports',
    });
    expect(takingsMessage({ total: 800, bills: 1 }, { total: 1000 }).body).toBe("1 bill · 20% down on yesterday. Tap for the day's report.");
    expect(takingsMessage({ total: 800, bills: 2 }, { total: 0 }).body).toBe("2 bills. Tap for the day's report.");
  });

  it('sends the morning stock note only when there is something to say', () => {
    expect(stockMessage({ expired: 0, expiring: 0, out: 0, low: 0 })).toBeNull();
    expect(stockMessage({ expired: 1, expiring: 4, out: 0, low: 7 })).toMatchObject({
      body: '1 expired lot on the shelf · 4 expiring soon · 7 running low.',
      url: '/expiry',
    });
    expect(stockMessage({ expired: 0, expiring: 0, out: 2, low: 0 })?.url).toBe('/stock?status=low');
  });
});
