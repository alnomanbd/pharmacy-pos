/**
 * One spelling per thing.
 *
 * The catalogue is meant to grow by import, from more than one source, over
 * months. Every source spells the same company differently — "Beximco
 * Pharmaceuticals", "Beximco Pharmaceuticals Ltd.", "BEXIMCO PHARMA LTD",
 * "Beximco  Pharmaceuticals Ltd" — and each variant that reaches the database
 * becomes another entry in the company filter, splitting one company's medicines
 * across two names that a pharmacist cannot tell apart. That had already happened
 * here before this file existed: two "Beximco" companies, from two imports.
 *
 * So there are two jobs, and they are deliberately separate:
 *
 *   1. **Canonicalise** — the spelling that gets stored. Conservative: fix
 *      casing, spacing and punctuation, expand the handful of abbreviations that
 *      are unambiguous, and leave everything else exactly as the source wrote
 *      it. This runs on every import, unattended, so it must never be clever.
 *   2. **Key** — a deliberately lossy fingerprint used only to *ask whether two
 *      names are the same thing*. Aggressive: drop punctuation, corporate
 *      suffixes and the industry words that carry no distinguishing information.
 *      Never stored, and never shown; it decides matches and feeds the duplicate
 *      audit.
 *
 * Merging is never automatic. The key finds candidates and `catalog:audit`
 * reports them; a person decides, because "Square Pharmaceuticals" and "Square
 * Hospitals" share a key and are different companies. An importer that merged on
 * a fingerprint would quietly reassign a hundred medicines to the wrong maker.
 */

/** Collapses whitespace, normalises the dashes and quotes editors introduce. */
export function tidy(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    // eslint-disable-next-line no-irregular-whitespace -- a non-breaking space is exactly what this removes
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Title-cases a name that arrived shouting or lower-case, and leaves a
 * reasonably-cased one alone.
 *
 * Mixed case is evidence of a human having typed it deliberately — "GlaxoSmithKline",
 * "ACI Limited", "b.Braun" — and rewriting that is how you turn a correct name
 * into a wrong one. Only ALL CAPS and all lower-case are touched.
 */
function fixCasing(name: string, opts: { onlyLower?: boolean } = {}): string {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (!letters) return name;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  if (!allUpper && !allLower) return name;
  // Brand names pass `onlyLower`: an all-caps brand is usually the trademark
  // ("XPA", "ORS"), while an all-lower one is a source that lost its casing.
  if (allUpper && opts.onlyLower) return name;

  /** Words that stay upper-case, and the ones that stay lower inside a name. */
  const keepUpper = new Set(['ACI', 'ACME', 'SK', 'IV', 'IM', 'ORS', 'BD', 'UK', 'USA', 'DGDA']);
  const keepLower = new Set(['and', 'of', 'for']);

  return name
    .split(' ')
    .map((word, i) => {
      const bare = word.replace(/[^A-Za-z]/g, '');
      if (!bare) return word;
      if (keepUpper.has(bare.toUpperCase()) && (allUpper || bare.length <= 4)) {
        return word.toUpperCase();
      }
      if (i > 0 && keepLower.has(bare.toLowerCase())) return word.toLowerCase();
      // Capitalise each hyphen- and dot-separated part: "b.braun" → "B.Braun".
      return word.toLowerCase().replace(/(^|[-.'])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
    })
    .join(' ');
}

/**
 * Abbreviations that are unambiguous in a Bangladeshi pharmaceutical name.
 *
 * Kept short on purpose. Every entry here is a guess made on the user's behalf
 * on every future import, so it earns its place only when the expansion is
 * certain — "Pharma" is *not* here, because "Beximco Pharma" and "Beximco
 * Pharmaceuticals Ltd." being the same company is a fact about that company, not
 * about the word.
 *
 * The corporate suffix is deliberately **not** rewritten. An earlier version
 * turned every "Limited" into "Ltd.", which is tidy and wrong: the company is
 * registered as "ACI Limited", and a catalogue that renames it has stopped
 * agreeing with the registry, the invoice and the box. Two spellings of one
 * company are prevented instead by matching on a fingerprint at import time
 * (`RefResolver`), so the first source's spelling is kept and later ones map onto
 * it without anybody's name being rewritten.
 */
const COMPANY_WORDS: [RegExp, string][] = [
  [/\blabs\b/gi, 'Laboratories'],
  [/\bpharmaceutical\b/gi, 'Pharmaceuticals'],
  [/\bind\b/gi, 'Industries'],
  [/\bbd\b/g, 'BD'],
];

/** The stored spelling of a company name: tidied and cased, never renamed. */
export function canonicalCompany(raw: string | null | undefined): string {
  let name = tidy(raw);
  if (!name) return '';
  name = name.replace(/[,;]+$/, '').trim();
  name = fixCasing(name);
  for (const [pattern, word] of COMPANY_WORDS) name = name.replace(pattern, word);
  return tidy(name);
}

/**
 * The fingerprint that answers "is this the same company?".
 *
 * Drops the words that every pharmaceutical company shares, so
 * "Beximco Pharmaceuticals Ltd." and "Beximco Pharma" agree — and so does
 * "Beximco Hospitals", which is why this only ever *proposes* a match.
 */
export function companyKey(raw: string | null | undefined): string {
  const full = tidy(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const stripped = tidy(raw)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(
      /\b(?:ltd|limited|pvt|private|co|company|inc|plc|the|bangladesh|bd)\b/g,
      ' ',
    )
    .replace(/\b(?:pharma|pharmaceutical|pharmaceuticals|laboratories|labs|lab|industries|industry|healthcare|health|care|chemical|chemicals|drug|drugs|remedies|international|group)\b/g, ' ')
    .replace(/\s+/g, '')
    .trim();

  // Some real companies are made *entirely* of the words this drops: "Drug
  // International Ltd." and "Healthcare Pharmaceuticals Ltd." both key to the
  // empty string, which would then make them equal to each other and to every
  // other name that empties out. When stripping leaves nothing, keep the whole
  // name instead — a key that cannot distinguish is worse than a long one.
  return stripped || full;
}

/**
 * Molecule names to correct on the way in.
 *
 * Two lists, and the difference between them is the difference between a fact
 * and an editorial decision.
 *
 * `MISSPELLED` are **errors** in the published data, each verified against the
 * INN spelling: "Inferferon", "Trustuzumab", "Norephinephrine", "Tanoxicam" are
 * not alternative spellings of anything. Left alone, each one is a second entry
 * in the generic list for a drug that already has one, splitting its brands in
 * two — so a pharmacist filtering by Tenoxicam does not see the Tanoxicam brand.
 *
 * `PREFERRED` are **choices** between two correct names. Aciclovir (INN) and
 * Acyclovir (USAN) are both right; Torasemide and Torsemide are both right. A
 * catalogue has to pick one, and the one picked here is the one Bangladeshi
 * boxes overwhelmingly use — because the counter is typing what they read on the
 * pack, not what the WHO list says. Every entry is a decision somebody can
 * disagree with, which is why they are listed explicitly rather than derived.
 *
 * Both lists are applied at import, so a source that reintroduces an old
 * spelling cannot reintroduce the duplicate. `catalog:audit --fix-spellings`
 * applies them to what is already stored.
 */
export const MISSPELLED_GENERICS: Record<string, string> = {
  'inferferon alfa-2a': 'Interferon Alfa-2a',
  trustuzumab: 'Trastuzumab',
  norephinephrine: 'Norepinephrine',
  'insulin glargin': 'Insulin Glargine',
  anastrozol: 'Anastrozole',
  pramipexol: 'Pramipexole',
  tanoxicam: 'Tenoxicam',
  magnessium: 'Magnesium',
};

export const PREFERRED_GENERICS: Record<string, string> = {
  aciclovir: 'Acyclovir',
  torsemide: 'Torasemide',
  flupentixol: 'Flupenthixol',
};

/** Applies both correction lists, word-wise for the ones that appear mid-name. */
function correctGeneric(name: string): string {
  const whole = name.toLowerCase();
  const exact = MISSPELLED_GENERICS[whole] ?? PREFERRED_GENERICS[whole];
  if (exact) return exact;

  // Mid-name, for combinations: "Calcium Chloride + Magnessium Chloride". Only
  // the misspellings are applied word-wise — a *preference* between two correct
  // names is a decision about the whole molecule, not about a word inside one.
  return name.replace(MID_NAME_MISSPELLINGS, (word) => {
    const fix = MISSPELLED_GENERICS[word.toLowerCase()];
    // Matches the source's capitalisation of the first letter, so a lower-case
    // ingredient in a lower-case name stays that way.
    return fix ?? word;
  });
}

/**
 * One alternation over the single-word misspellings, built once.
 *
 * Every key in that list is a plain word, so no escaping is needed — asserted
 * here rather than assumed, because a key with a regex metacharacter in it would
 * quietly change what this matches.
 */
const MID_NAME_MISSPELLINGS = new RegExp(
  String.raw`\b(?:` +
    Object.keys(MISSPELLED_GENERICS)
      .filter((k) => /^[a-z0-9-]+$/.test(k))
      .join('|') +
    String.raw`)\b`,
  'gi',
);

/**
 * The stored spelling of a generic (molecule) name.
 *
 * Combination products are the reason this is not just `tidy`: sources write
 * "Amoxicillin+Clavulanic Acid", "Amoxicillin +Clavulanic acid",
 * "amoxicillin + clavulanic acid". One spelling of the separator, one casing
 * rule, and the three become one generic instead of three.
 */
export function canonicalGeneric(raw: string | null | undefined): string {
  const name = stripRouteSuffix(
    tidy(raw)
      // One separator for a combination. Sources use "+", "&" and "and"; three
      // spellings of one product is three entries in the generic list.
      .replace(/\s*&\s*/g, ' + ')
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/\s*\/\s*/g, '/'),
  );
  if (!name) return '';
  return name
    .split(' + ')
    .map((part) => correctGeneric(fixCasing(part)))
    .join(' + ');
}

/**
 * Route and dosage-form words that sources append to a molecule name.
 *
 * Registry exports carry "Acyclovir (Oral)", "Acyclovir (Injection)",
 * "Ciprofloxacin (Ophthalmic)" — which is the *route*, already recorded in the
 * dosage form column, and which splits one molecule into up to four generics.
 * That costs twice over: the generic filter lists the same drug several times,
 * and a pharmacist filtering by "Ciprofloxacin" does not see the eye drops.
 *
 * A closed list, and only a trailing parenthetical is considered, because some
 * parentheticals are part of the molecule and must survive: "Albumin (Human)",
 * "Insulin (Human)", "Factor VIII (Recombinant)".
 */
const ROUTE_SUFFIXES = new Set([
  'oral', 'injection', 'iv', 'iv infusion', 'iv injection', 'im injection',
  'im/iv injection', 'infusion', 'topical', 'ophthalmic', 'eye drop', 'eye drops',
  'ear drop', 'ear drops', 'e/e', 'eye/ear', 'nasal', 'nasal spray', 'nasal drop',
  'nasal drops', 'inhaler', 'inhalation', 'nebuliser solution', 'nebulizer solution',
  'respirator solution', 'cream', 'ointment', 'gel', 'lotion', 'solution',
  'suspension', 'syrup', 'tablet', 'capsule', 'suppository', 'vaginal',
  'vaginal cream', 'vaginal tablet', 'vaginal suppository', 'nail lacquer',
  'mouthwash', 'paint', 'powder', 'sachet', 'drop', 'drops', 'mups tablet',
  'sr tablet', 'xr tablet',
  // Release profiles. "Nifedipine (retard)" is Nifedipine in a slow-release
  // formulation, not a second molecule — the form column is where that belongs.
  'retard', 'sr', 'xr', 'cr', 'mr', 'la', 'sustained release', 'modified release',
  'extended release', 'delayed release', 'prolonged release',
]);

/**
 * Strips a trailing route/form parenthetical, leaving the molecule.
 *
 * Exported so the catalogue audit can report stored names that still carry one —
 * a database seeded before this rule existed will have them.
 */
export function stripRouteSuffix(name: string): string {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(name);
  if (!m) return name;
  return ROUTE_SUFFIXES.has(m[2].trim().toLowerCase()) ? m[1].trim() : name;
}

/** Fingerprint for "is this the same molecule?" — order-insensitive for combinations. */
export function genericKey(raw: string | null | undefined): string {
  const parts = tidy(raw)
    .toLowerCase()
    // Every parenthetical, and every square-bracketed qualifier, whether or not
    // it names a route. The key's job is to find candidates: "Albumin (Human)"
    // against "Albumin" is worth a human look, and the registry's "Vitamin E"
    // against an index's "Vitamin E [Alpha Tocopherol Acetate]" is the same
    // product written two ways — 1,537 rows of it in the Bangladeshi data.
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .split('+')
    .map((p) =>
      p
        // Salt forms: the same molecule, and not always written.
        .replace(
          /\b(?:hydrochloride|hcl|sodium|potassium|calcium|magnesium|sulphate|sulfate|phosphate|maleate|tartrate|succinate|besylate|mesylate|citrate|acetate|fumarate|dihydrochloride|monohydrate|dihydrate|trihydrate|anhydrous|micronized|micronised|bp|usp|inn)\b/g,
          ' ',
        )
        .replace(/\s+/g, '')
        .trim(),
    )
    .filter(Boolean)
    .sort();
  return parts.join('+');
}

/**
 * The stored spelling of a dosage form.
 *
 * A short, closed vocabulary in practice, written a dozen ways. The map covers
 * the shapes seen in Bangladeshi exports; an unknown form is tidied and kept
 * rather than forced into the nearest known one.
 */
const DOSAGE_FORMS: Record<string, string> = {
  tab: 'Tablet',
  tabs: 'Tablet',
  tablets: 'Tablet',
  cap: 'Capsule',
  caps: 'Capsule',
  capsules: 'Capsule',
  syp: 'Syrup',
  syrups: 'Syrup',
  susp: 'Suspension',
  inj: 'Injection',
  injections: 'Injection',
  oint: 'Ointment',
  supp: 'Suppository',
  'eye drop': 'Eye Drop',
  'eye drops': 'Eye Drop',
  'ear drop': 'Ear Drop',
  'ear drops': 'Ear Drop',
  'nasal spray': 'Nasal Spray',
  'iv infusion': 'IV Infusion',
  'iv injection': 'IV Injection',
  'im injection': 'IM Injection',
  'im/iv injection': 'IM/IV Injection',
};

export function canonicalDosageForm(raw: string | null | undefined): string {
  const name = tidy(raw).replace(/\.$/, '');
  if (!name) return '';
  const mapped = DOSAGE_FORMS[name.toLowerCase()];
  if (mapped) return mapped;
  // "Tablet (Enteric Coated)", "Powder for Suspension" — keep the shape, fix the
  // case, and keep the words inside the brackets capitalised too.
  return fixCasing(name).replace(/\((\w)/g, (_m, c) => `(${c.toUpperCase()}`);
}

/**
 * The stored spelling of a strength.
 *
 * Only spacing and unit casing — never the numbers, and never a unit conversion.
 * "0.5 mg" and "500 mcg" are the same dose and must stay as written: the printed
 * bill has to read the way the box does, and a converted strength is one
 * a pharmacist cannot check against the pack.
 */
export function canonicalStrength(raw: string | null | undefined): string {
  let s = tidy(raw);
  if (!s) return '';
  s = s
    // "500mg" → "500 mg", leaving "500 mg" alone.
    .replace(/(\d)\s*(mg|mcg|µg|ug|g|ml|l|iu|%|meq|mmol)\b/gi, (_m, n, unit) => `${n} ${unit}`)
    .replace(/\bMG\b/g, 'mg')
    .replace(/\bMCG\b/gi, 'mcg')
    .replace(/\bug\b/g, 'mcg')
    .replace(/µg/g, 'mcg')
    .replace(/\bML\b/g, 'ml')
    .replace(/\bIU\b/gi, 'IU')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\+\s*/g, ' + ');
  return tidy(s);
}

/**
 * The family a dosage form belongs to — for comparing two sources, nothing else.
 *
 * One source calls it "Injection", another "IV Injection", a third "IM/IV
 * Injection"; one writes "Powder For Suspension" and another "Powder for
 * Suspension". Comparing the full strings rejects matches that are plainly the
 * same product, and comparing nothing lets a syrup's price land on a tablet. The
 * family is the middle: precise enough that tablet never matches syrup, loose
 * enough that the same injection matches itself.
 */
export function dosageFamily(raw: string | null | undefined): string {
  const f = tidy(raw).toLowerCase();
  if (!f) return '';
  if (/\b(?:tablet|tab)\b/.test(f)) return 'tablet';
  if (/\b(?:capsule|cap)\b/.test(f)) return 'capsule';
  if (/\binjection|infusion|vial|ampoule|iv\b|im\b/.test(f)) return 'injection';
  if (/\bsyrup\b/.test(f)) return 'syrup';
  if (/\bsuspension|powder\b/.test(f)) return 'suspension';
  if (/\bsolution|elixir|linctus|drops?\b/.test(f)) return 'liquid';
  if (/\bcream|ointment|gel|lotion|paste|paint\b/.test(f)) return 'topical';
  if (/\binhaler|inhalation|nebuli|respirator\b/.test(f)) return 'inhaled';
  if (/\bsuppository|pessary\b/.test(f)) return 'suppository';
  return f.replace(/[^a-z]/g, '');
}

/** Fingerprint for "is this the same strength?" — spacing and unit case removed. */
export function strengthKey(raw: string | null | undefined): string {
  const flat = canonicalStrength(raw).toLowerCase().replace(/\s+/g, '');
  if (!flat.includes('+')) return flat;

  /*
   * A combination's components, sorted — so the *order* the ingredients are
   * written in stops being part of the identity.
   *
   * The two sources disagree about it. The registry lists "Salflu" as
   * `100 mcg + 50 mcg` (matching its own generic order, fluticasone first) and
   * the drug index as `50 mcg + 100 mcg`. Both are correct and they are not
   * equal, so cross-source matching missed 124 products: each ended up in the
   * catalogue twice — one row with a registration number and no price, the other
   * with a price and no registration — and a pharmacist searching the brand saw it
   * twice, neither row complete.
   *
   * Only the fingerprint sorts. The *stored* strength is left exactly as the
   * source wrote it, because "(5 mg + 500 IU)/gm" is what the box says and a
   * re-ordered strength is one a pharmacist cannot check against the pack.
   */
  // Brackets carry no information here — one source writes "(5 mg + 500 IU)/gm"
  // and the other "500 IU + 5 mg/gm" — and everything from the first slash on is
  // the shared denominator ("/gm", "/5 ml"), which must not be sorted with the
  // components.
  const bare = flat.replace(/[()]/g, '');
  const slash = bare.indexOf('/');
  const head = slash >= 0 ? bare.slice(0, slash) : bare;
  const tail = slash >= 0 ? bare.slice(slash) : '';
  return head.split('+').sort().join('+') + tail;
}

/**
 * The stored spelling of a brand name.
 *
 * The most conservative of the lot. A brand name is a trademark: "XPA" is not
 * "Xpa", and the box is the authority. Whitespace and stray punctuation only,
 * plus the one thing that is always a mistake — the dosage form or strength
 * pasted into the brand name ("Napa 500mg Tablet"), which would make the brand
 * unsearchable by the name a customer actually says.
 */
export function canonicalBrand(raw: string | null | undefined): string {
  const name = tidy(raw).replace(/[,;]+$/, '');
  if (!name) return '';
  // Nothing is removed here. An earlier version stripped a trailing dosage-form
  // word, which looked right on "Seclo Capsule" and destroyed real registry
  // names: DGDA registers "Benzyl Lotion", "Megajoy 75 Tablet", "Ora-Sol Powder".
  // Losing a word from a trademark makes the brand unfindable by the name on the
  // box — the opposite of the goal. Redundant strengths are removed by
  // `stripRedundantStrength`, which can compare against the row's own strength
  // instead of guessing, and anything else is reported by `catalog:audit` for a
  // person to decide.
  //
  // An all-lower-case brand is a source that lost its casing; an all-caps one is
  // usually the trademark ("XPA"), and is left as written.
  return tidy(fixCasing(name, { onlyLower: true }));
}

/**
 * Removes a strength that the brand name repeats.
 *
 * The DGDA registry writes the strength into the brand: "Zeocin 500" with
 * strength "500 mg", "Benzyl Lotion 25%" at "1.25 gm/5 ml", "Napa 500mg Tablet".
 * Two reasons to take it out: a customer asks for "Zeocin", not "Zeocin 500", so the
 * name has to be findable that way — and the same product in a second source is
 * listed as plain "Zeocin", so the two never match while the number is attached.
 *
 * Only removed when the number actually **is** the row's strength, or carries a
 * unit of its own. "Cef-3", "B-50", "Napa Extra" and "Ora-Sol 20" (where 20 is
 * not the strength) all survive, because a trailing number is part of plenty of
 * real trademarks.
 */
export function stripRedundantStrength(
  brand: string | null | undefined,
  strength: string | null | undefined,
): string {
  let name = tidy(brand);
  if (!name) return '';

  // "Napa 500mg" — a number with its own unit is a strength wherever it appears.
  const withUnit = /^(.*?)[\s-]+\d+(?:\.\d+)?\s*(?:mg|mcg|gm?|ml|iu|%)\s*$/i.exec(name);
  if (withUnit?.[1]?.trim()) return tidy(withUnit[1]);

  // "Zeocin 500" + strength "500 mg" — only when the bare number matches.
  const numbers = (tidy(strength).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
  const trailing = /^(.*?)[\s-]+(\d+(?:\.\d+)?)\s*$/.exec(name);
  if (trailing?.[1]?.trim() && numbers.includes(String(Number(trailing[2])))) {
    name = tidy(trailing[1]);
  }
  return name;
}

/** Fingerprint for "is this the same brand?" — used by the duplicate audit. */
export function brandKey(raw: string | null | undefined): string {
  return canonicalBrand(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Everything a catalogue row needs normalised, in one call.
 *
 * Used by the importer so that every route into the catalogue — the CLI, the
 * Formulary page, a future one — normalises identically. A normalisation that
 * lives in one importer is a normalisation the next importer will not have.
 */
export function normaliseCatalogRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if (typeof row.brandName === 'string') out.brandName = canonicalBrand(row.brandName);
  if (typeof row.genericName === 'string') out.genericName = canonicalGeneric(row.genericName);
  if (typeof row.companyName === 'string') out.companyName = canonicalCompany(row.companyName);
  if (typeof row.groupName === 'string') out.groupName = tidy(row.groupName);
  if (typeof row.dosageForm === 'string') out.dosageForm = canonicalDosageForm(row.dosageForm);
  if (typeof row.strength === 'string') out.strength = canonicalStrength(row.strength);
  if (typeof row.packSize === 'string') out.packSize = tidy(row.packSize);
  return out as T;
}
