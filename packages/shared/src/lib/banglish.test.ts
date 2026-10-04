import { describe, it, expect } from 'vitest';
import { toBangla, isBanglishLetter } from './banglish';

/**
 * The phonetic keyboard, tested on the words a medicine counter actually types —
 * the dosing vocabulary, the advice a salesman repeats twenty times a day, and
 * the things that must *not* be converted.
 */
describe('toBangla', () => {
  it('writes the dosing vocabulary', () => {
    // The words the Bangla dosing line is made of; if these are wrong, nothing
    // else matters.
    expect(toBangla('sokal')).toBe('সকাল');
    expect(toBangla('dupur')).toBe('দুপুর');
    expect(toBangla('bikal')).toBe('বিকাল');
    expect(toBangla('rat')).toBe('রাত');
    expect(toBangla('din')).toBe('দিন');
    expect(toBangla('khabarer pore')).toBe('খাবারের পরে');
    expect(toBangla('khabarer age')).toBe('খাবারের আগে');
  });

  it('writes an advice line', () => {
    expect(toBangla('prochur pani pan korun')).toBe('প্রচুর পানি পান করুন');
    expect(toBangla('beshi kore gorom pani khaben')).toBe('বেশি করে গরম পানি খাবেন');
  });

  it('treats `o` after a consonant as the inherent vowel', () => {
    /*
     * The rule the whole design rests on: a Bengali consonant already carries
     * `অ`, so `o` adds nothing after one and is a letter on its own elsewhere.
     * Without it `sokal` would be সোকাল.
     */
    expect(toBangla('sokal')).toBe('সকাল');
    expect(toBangla('o')).toBe('অ');
    // A word the list does not carry, so this really is the rule at work:
    // `গরম`, not `গোরম`.
    expect(toBangla('goromer')).toBe('গরমের');
  });

  it('builds a conjunct from adjacent consonants', () => {
    expect(toBangla('sondhya')).toBe('সন্ধ্যা');
    expect(toBangla('prochur')).toBe('প্রচুর');
    expect(toBangla('sasthyo')).toBe('সাস্থ্য');
  });

  it('knows `y` and `w` as phalas after a consonant and letters alone', () => {
    // থ্য not থ্য়, and অয় not অব.
    expect(toBangla('thya')).toBe('থ্যা');
    expect(toBangla('oy')).toBe('অয়');
    expect(toBangla('sw')).toBe('স্ব');
  });

  it('leaves numbers, units and doses alone', () => {
    /*
     * A salesman types a brand and a strength in the same field as Bangla text,
     * and both have to survive: the customer reads `500 mg` off the bill.
     */
    expect(toBangla('2.5 ml')).toBe('2.5 ম্ল');
    expect(toBangla('1+0+1')).toBe('1+0+1');
    expect(toBangla('500')).toBe('500');
  });

  it('makes a full stop a dari only at the end of a sentence', () => {
    // Both directions matter: the first is what a Bangla note wants, the second is
    // an email address surviving a field in Bangla mode.
    expect(toBangla('tin din khaben.')).toBe('তিন দিন খাবেন।');
    expect(toBangla('demo.com')).toBe('দেম.চম');
    expect(toBangla('2.5')).toBe('2.5');
  });

  it('passes Bangla through untouched', () => {
    // Pasted text, or a typist with a real Bangla keyboard, must not be
    // double-converted.
    expect(toBangla('সকাল')).toBe('সকাল');
    expect(toBangla('সকাল, রাত')).toBe('সকাল, রাত');
  });

  it('returns an empty string for an empty input', () => {
    expect(toBangla('')).toBe('');
  });

  it('knows which keystrokes continue a word', () => {
    // What the input component buffers: letters plus the three mark keys.
    expect(isBanglishLetter('k')).toBe(true);
    expect(isBanglishLetter('^')).toBe(true);
    expect(isBanglishLetter(' ')).toBe(false);
    expect(isBanglishLetter('5')).toBe(false);
    expect(isBanglishLetter('.')).toBe(false);
  });
});

describe('capitals', () => {
  it('reads a capital with no meaning of its own as lowercase, as Avro does', () => {
    expect(toBangla('Karim')).toBe(toBangla('karim'));
    expect(toBangla('Bangladesh')).toBe('বাংলাদেশ');
  });

  it('keeps the capitals that mean something', () => {
    expect(toBangla('sOnar')).toBe('সোনার');
    expect(toBangla('Dhaka')).toBe('ঢাকা');
  });

  it('reads R and N at the start of a word as a name’s capital — no word starts with ড় or ণ', () => {
    expect(toBangla('Rahim')).toBe(toBangla('rahim'));
    expect(toBangla('Nasrin')).toBe(toBangla('nasrin'));
  });
});
