import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Bangla or English, for every app in this product.
 *
 * The person standing at a pharmacy counter for ten hours is less likely to
 * work in English than anybody else who touches this product. What is shared is
 * the machinery — the preference, the fallback rule, the digits — while each
 * app keeps its own dictionary, since "Bill" and "Approve shop" are not words
 * the other one ever says.
 *
 * ## Three rules, and the third is the one that matters
 *
 * 1. **The chrome is translated, the data is not.** Navigation, labels, buttons,
 *    empty states and confirmations change language. A brand name, a customer's
 *    name, a batch number and anything somebody typed stay exactly as entered —
 *    a transliterated brand name is a name nobody can match against the box.
 * 2. **Identifiers stay in Latin digits.** A bill number, a phone number, an
 *    invoice number and a batch number are read aloud, typed into other systems
 *    and matched against paper. Counts, money and dates localise with
 *    `bnNumerals` where they are shown.
 * 3. **A missing key falls back to English, never to blank.** Half-translated is
 *    worse than untranslated: somebody who sees one screen in Bangla and the
 *    next in English reads it as a broken product, but a *word* in English
 *    inside a Bangla screen is just a word they already knew. So the translator
 *    takes the English text as its key and returns it when Bangla has nothing to
 *    say.
 */

export type UiLang = 'en' | 'bn';

interface LangState {
  lang: UiLang;
  setLang: (lang: UiLang) => void;
}

/**
 * Per person, not per shop.
 *
 * One counter may be staffed by somebody who wants Bangla and the owner's own
 * laptop by somebody who does not, and a shop-wide setting makes one of them
 * wrong. Kept in this browser: it is a preference, not a record.
 *
 * The key is the same in every app, which costs nothing and means the switch
 * is in the same place, under the same name, wherever somebody looks for it.
 */
export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      // English by default. A product that changes language on somebody without
      // being asked is a product they have to fix before they can use it.
      lang: 'en',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'dawai-ui-lang', storage: createJSONStorage(() => localStorage) },
  ),
);

/** The current language, for the rare caller that needs to branch on it. */
export function useUiLang(): UiLang {
  return useLangStore((s) => s.lang);
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Latin digits to Bangla ones. Only for what is read, never for what is typed. */
export function bnNumerals(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Builds an app's translator from its own dictionary.
 *
 * `t('Save')` in English is `Save` — the key *is* the English string, so a
 * screen no translator has looked at still reads correctly, and adding Bangla
 * later is one line in the dictionary rather than an edit to the screen.
 *
 * The optional second argument is for the rare key that is not its own English
 * text, such as a slug coming back from the server.
 */
export function makeUseT(bn: Record<string, string>) {
  const dictionaries: Record<UiLang, Record<string, string>> = { en: {}, bn };

  /*
   * Memoised on the language, and that is not a micro-optimisation.
   *
   * A fresh function on every render makes `t` a new value every render, and a
   * `useCallback` or `useEffect` that lists it then re-runs every render too —
   * which is an endless fetch loop on any screen whose loader was written the
   * obvious way. One screen shipped stuck on "Loading…" because of exactly
   * this, so the translator is stable and the mistake is no longer available.
   */
  return function useT(): (key: string, fallback?: string) => string {
    const lang = useLangStore((s) => s.lang);
    return useCallback(
      (key: string, fallback?: string) => dictionaries[lang][key] ?? fallback ?? key,
      [lang],
    );
  };
}
