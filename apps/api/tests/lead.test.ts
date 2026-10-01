import { describe, it, expect } from 'vitest';
import { screenLead } from '../src/services/lead.service.js';

/**
 * The public contact form's screening.
 *
 * This is the only writable endpoint in the app that takes no credentials, so
 * the rules in front of it are the ones worth pinning down: what a person is
 * told to fix, and what is quietly classified instead of argued with.
 */
const good = {
  name: 'Rahman Ahmed',
  email: 'Rahman@Example.COM',
  message: 'We run a pharmacy in Mirpur and want to move the stock off paper.',
};

describe('screenLead', () => {
  it('accepts a real enquiry and normalises what it stores', () => {
    const res = screenLead({ ...good, shop: '  Mirpur Pharmacy ', lang: 'bn' }, { ip: '1.2.3.4' });
    expect(res.verdict).toBe('store');
    // Lower-cased, because the duplicate check and the operator's search both
    // key on the address, and "Rahman@" and "rahman@" are one person.
    expect(res.row.email).toBe('rahman@example.com');
    expect(res.row.shop).toBe('Mirpur Pharmacy');
    expect(res.row.lang).toBe('bn');
    expect(res.row.ip).toBe('1.2.3.4');
    expect(res.row.source).toBe('landing');
  });

  it('refuses only what the person in front of the form can fix', () => {
    expect(() => screenLead({ ...good, name: '   ' })).toThrow(/name/i);
    expect(() => screenLead({ ...good, email: 'rahman@localhost' })).toThrow(/email/i);
    expect(() => screenLead({ ...good, message: 'call me' })).toThrow(/little more/i);
  });

  it('classifies a filled honeypot instead of rejecting it', () => {
    // The point of the trap is that a bot cannot tell it was caught. An error
    // here would teach a script which field to leave alone next time, so the
    // submission is *stored* as spam and the caller is answered normally.
    const res = screenLead({ ...good, trap: 'https://buy-cheap.example' });
    expect(res.verdict).toBe('spam');
    if (res.verdict === 'spam') expect(res.reason).toMatch(/honeypot/i);
    // Still captured in full: a spam run is exactly what you want to read back
    // when tuning the trap.
    expect(res.row.message).toBe(good.message);
  });

  it('treats an empty trap as untouched', () => {
    // Browsers submit an empty string for a field nobody typed in, and an
    // autofill can put whitespace there. Neither is a bot.
    expect(screenLead({ ...good, trap: '' }).verdict).toBe('store');
    expect(screenLead({ ...good, trap: '   ' }).verdict).toBe('store');
  });

  it('defaults the language rather than trusting an odd value', () => {
    // `lang` decides which language the reply goes out in; anything that is not
    // Bengali is answered in English rather than in nothing.
    expect(screenLead({ ...good, lang: undefined }).row.lang).toBe('en');
    expect(screenLead({ ...good, lang: 'xx' as 'en' }).row.lang).toBe('en');
  });

  it('caps the user agent so a long header cannot bloat the row', () => {
    const res = screenLead(good, { userAgent: 'x'.repeat(1000) });
    expect(res.row.userAgent).toHaveLength(300);
  });
});
