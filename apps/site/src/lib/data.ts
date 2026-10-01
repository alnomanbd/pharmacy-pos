/**
 * Real Bangladeshi brands from the catalogue `pharmacy/` searches.
 *
 * Used only as a row of names. Nothing here is presented as a customer, a
 * price or a claim about any manufacturer — a marketing site has no business
 * implying an endorsement, and a row of names the counter actually types is
 * more convincing than an illustration of a pill.
 */
export const MEDICINE_BRANDS = [
  'Napa Extra',
  'Seclo 20',
  'Alatrol',
  'Fexo 120',
  'Pantonix',
  'Monocept',
  'Ace Plus',
  'Seclo 40',
  'Napa',
  'Monas',
  'Fexo',
  'Econil',
  'Cefo-3',
  'Alprax',
  'Zinc SR',
  'Histacin',
  'Motiril',
  'Dexa',
  'Combivir',
  'Amdocal',
  'Esomep 20',
  'Loratadine',
  'Tiara',
  'Bexar',
] as const;

/**
 * The six rows the billing mock shows, and the cycle it cycles through.
 *
 * A real brand, a real rack, a real strip count and a real piece price — every
 * figure here is a shape the app's own data has, so the screenshot of the
 * marketing page is also a description of the product. The one thing changed is
 * the money, which is a plausible evening rather than anybody's takings.
 */
export const BILLING_TAPE: ReadonlyArray<readonly [string, string, number, number]> = [
  ['Napa Extra 500mg', 'A-1 · 1 strip', 30, 32],
  ['Seclo 20mg', 'A-2 · 2 strips', 60, 58],
  ['Alatrol 10mg', 'A-1 · 1 strip', 20, 21],
  ['Fexo 120mg', 'A-3 · 1 strip', 40, 42],
  ['Pantonix 40mg', 'A-2 · 1 strip', 30, 30],
  ['Monocept 10mg', 'B-1 · 1 strip', 45, 45],
  ['Ace Plus', 'A-1 · 1 strip', 30, 33],
  ['Histacin 10mg', 'C-1 · 1 strip', 18, 19],
] as const;
