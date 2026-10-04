import { describe, it, expect } from 'vitest';
import { fillReminder, reminderMessage, smsParts, standardReminder } from './reminderSms';

/** The reminder SMS as the shop writes it — the same rules the API sends by. */
describe('the reminder wording', () => {
  it('fills the blanks, and drops one with nothing to fill it', () => {
    expect(fillReminder('{name} bhai, {shop} e baki Tk {amount}. {phone}', { name: 'Rahim', amount: 1250.5, shop: 'Jonni', phone: '017' })).toBe(
      'Rahim bhai, Jonni e baki Tk 1250.5. 017',
    );
    expect(fillReminder('Baki Tk {amount}. Call {phone}.', { amount: 300 })).toBe('Baki Tk 300. Call.');
  });

  it('is the standard line when the shop has written nothing', () => {
    expect(reminderMessage('  ', { amount: 100, shop: 'Jonni', phone: '017' })).toBe(standardReminder({ amount: 100, shop: 'Jonni', phone: '017' }));
    expect(reminderMessage('Hi {name}', { name: 'Karim', amount: 1 })).toBe('Hi Karim');
  });
});

describe('what a message costs', () => {
  it('counts plain text as GSM: 160 in one, 153 a part after that', () => {
    expect(smsParts('a'.repeat(160))).toMatchObject({ parts: 1, unicode: false });
    expect(smsParts('a'.repeat(161))).toMatchObject({ parts: 2, unicode: false, perPart: 153 });
  });

  it('counts the escaped characters twice', () => {
    expect(smsParts('€').chars).toBe(2);
  });

  it('turns the whole message to Unicode for one Bangla letter: 70 in one, 67 a part', () => {
    expect(smsParts('আ'.repeat(70))).toMatchObject({ parts: 1, unicode: true });
    expect(smsParts('Tk 500 বাকি ' + 'a'.repeat(60))).toMatchObject({ parts: 2, unicode: true, perPart: 67 });
  });

  it('the standard reminder is one plain SMS', () => {
    const m = smsParts(standardReminder({ amount: 12345.5, shop: 'Shah Ali Pharmacy & Surgical', phone: '01711000000' }));
    expect(m).toMatchObject({ parts: 1, unicode: false });
  });
});
