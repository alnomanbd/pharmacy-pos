import { describe, it, expect } from 'vitest';
import { mails, langFor, taka, on } from '../src/services/notification.service.js';
import { takingsMessage, stockMessage, orderMessage, testMessage } from '../src/services/push.service.js';
import { bnDigits, num } from '../src/i18n/numerals.js';

const LATIN_DIGIT = /[0-9]/;

describe('Bangla digits', () => {
  it('turns every digit and leaves the rest', () => {
    expect(bnDigits('৳12,540 · 3 bills')).toBe('৳১২,৫৪০ · ৩ bills');
    expect(num(1250, 'bn')).toBe('১,২৫০');
    expect(num(1250, 'en')).toBe('1,250');
  });
});

describe('emails in the reader\'s language', () => {
  it('writes money and dates in Bangla digits and Bangla month names', () => {
    expect(taka(12540, 'bn')).toBe('৳১২,৫৪০');
    expect(taka(12540)).toBe('BDT 12,540');
    const d = new Date(2026, 9, 5, 12);
    expect(on(d, 'bn')).toContain('অক্টোবর');
    expect(on(d, 'bn')).not.toMatch(LATIN_DIGIT);
    expect(on(d)).toBe('5 Oct 2026');
  });

  it('chooses the Bangla template for bn and English otherwise', () => {
    const to = { email: 'a@b.c', name: 'Rahim', shop: 'Rahim Pharmacy', amount: 1500, plan: 'Basic', coversUntil: new Date(2026, 11, 31, 12), invoiceNo: 'INV-2026-0042' };
    const bn = mails.paymentVerified(to, 'bn');
    const en = mails.paymentVerified(to, 'en');
    expect(bn.subject).toContain('পেমেন্ট নিশ্চিত');
    expect(bn.subject).toContain('ডিসেম্বর');
    expect(bn.text).toContain('৳১,৫০০');
    // An invoice number is an identifier: it stays in Latin digits.
    expect(bn.text).toContain('INV-2026-0042');
    expect(bn.html).toContain('lang="bn"');
    expect(bn.html).toContain('Dawai');
    expect(en.subject).toMatch(/^Payment confirmed/);
    expect(en.text).toContain('BDT 1,500');
    expect(en.html).toContain('lang="en"');
  });

  it('has a Bangla version of every shop-facing email', () => {
    const base = {
      email: 'a@b.c', name: 'Rahim', shop: 'Rahim Pharmacy', operator: 'Karim', at: new Date(), ip: '1.2.3.4',
      userAgent: 'Chrome', reason: 'Unpaid', amount: 900, method: 'bKash', trxId: 'TRX9', plan: 'Basic',
      coversUntil: new Date(), daysLeft: 3, endsAt: new Date(), endedAt: new Date(), url: 'https://x/y?token=1',
      brandName: 'Napa', added: true, trialEndsAt: new Date(),
    };
    for (const [name, render] of Object.entries(mails)) {
      const bn = (render as (t: typeof base, l: 'en' | 'bn') => { subject: string; text: string; html: string })(base, 'bn');
      const en = (render as (t: typeof base, l: 'en' | 'bn') => { subject: string; text: string; html: string })(base, 'en');
      expect(bn.subject, name).toMatch(/[ঀ-৿]/);
      expect(bn.text, name).toContain('প্রিয় Rahim');
      expect(en.text, name).toContain('Dear Rahim');
      expect(en.subject, name).not.toMatch(/[ঀ-৿]/);
    }
  });

  it('counts the days in Bangla', () => {
    const to = { email: 'a@b.c', name: 'R', shop: 'S', endsAt: new Date() };
    expect(mails.subscriptionEnding({ ...to, daysLeft: 3 }, 'bn').subject).toBe('S — সাবস্ক্রিপশন ৩ দিন পরে শেষ হবে');
    expect(mails.subscriptionEnding({ ...to, daysLeft: 1 }, 'bn').subject).toContain('আগামীকাল');
    expect(mails.subscriptionEnding({ ...to, daysLeft: 3 }, 'en').subject).toBe('S — subscription ends in 3 days');
  });

  it('keeps links exactly as they are', () => {
    const url = 'https://shop.example/reset-password?token=abc123';
    expect(mails.passwordReset({ email: 'a@b.c', name: 'R', url }, 'bn').html).toContain(`href="${url}"`);
  });

  it('takes the caller\'s language without a lookup', async () => {
    expect(await langFor({ email: 'nobody@example.com', lang: 'bn' })).toBe('bn');
    expect(await langFor({ email: 'nobody@example.com', lang: 'en' })).toBe('en');
  });
});

describe('push alerts in the reader\'s language', () => {
  it('writes the evening takings in Bangla', () => {
    const bn = takingsMessage({ total: 12450, bills: 37 }, { total: 10000 }, 'bn');
    expect(bn.title).toBe('আজ: ৳১২,৪৫০');
    expect(bn.body).toBe('৩৭টি বিল · গতকালের চেয়ে ২৫% বেশি। দিনের রিপোর্ট দেখতে ট্যাপ করুন।');
    expect(takingsMessage({ total: 800, bills: 1 }, { total: 1000 }, 'bn').body).toContain('২০% কম');
    expect(takingsMessage({ total: 12450, bills: 37 }, { total: 10000 }).title).toBe('Today: ৳12,450');
  });

  it('writes the morning stock note in Bangla, and only when there is something to say', () => {
    expect(stockMessage({ expired: 0, expiring: 0, out: 0, low: 0 }, 'bn')).toBeNull();
    const bn = stockMessage({ expired: 1, expiring: 4, out: 2, low: 7 }, 'bn')!;
    expect(bn.title).toBe('আজ সকালের স্টক');
    expect(bn.body).toContain('মেয়াদ শেষ');
    expect(bn.body).toContain('২টির স্টক শেষ');
    expect(bn.body).not.toMatch(LATIN_DIGIT);
    expect(bn.url).toBe('/expiry');
  });

  it('writes a new order in both languages, keeping the order number', () => {
    const o = { number: 'W-0012', customerName: 'Karim', mode: 'delivery', lines: [{ name: 'Napa', qty: 2 }] };
    expect(orderMessage(o, 'bn')).toMatchObject({ title: 'নতুন অর্ডার W-0012', body: 'Karim · ডেলিভারি — Napa ×২' });
    expect(orderMessage(o)).toMatchObject({ title: 'New order W-0012', body: 'Karim · delivery — Napa ×2' });
    expect(orderMessage({ ...o, mode: 'pickup', lines: [] }, 'bn').body).toBe('Karim · দোকানে এসে নেবেন');
  });

  it('has a Bangla test alert', () => {
    expect(testMessage('bn').body).toBe('অ্যালার্ট চালু আছে। এভাবেই দেখাবে।');
    expect(testMessage().body).toBe('Alerts are on. This is how they will look.');
  });
});
