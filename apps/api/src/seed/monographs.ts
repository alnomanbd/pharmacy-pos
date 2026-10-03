import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MedicineGenericModel } from '../models/index.js';
import { parseCsv } from '../services/formularyImport.service.js';

/**
 * What each generic is for and how it is used — indications, dosage, side
 * effects, contraindications, interactions, pregnancy, precautions — from the
 * drug index's `generic.csv`, onto the catalogue's generics.
 *
 * On the generic, not the brand: every Napa and every Ace is paracetamol, and
 * says the same thing about it. A brand shows its generic's.
 *
 *   npm run catalog:monographs -- --medex=/path/to/archive
 *
 * The index names generics its own way — with the salt ("Ceftriaxone
 * Sodium"), in another order ("Paracetamol + Caffeine"), or by another name
 * ("Ascorbic Acid" for Vitamin C) — so both sides are reduced to the same key
 * before matching (`genericKey`). Running it again rewrites the same text: it
 * is safe to repeat after the index is refreshed.
 *
 * Stored as plain text with line breaks and "• " bullets, never as the
 * source's HTML, so nothing from it is ever put into a page as markup.
 */

export const MONOGRAPH_SECTIONS = {
  indications: 'indication description',
  therapeuticClass: 'therapeutic class description',
  pharmacology: 'pharmacology description',
  dosage: 'dosage description',
  administration: 'administration description',
  interactions: 'interaction description',
  contraindications: 'contraindications description',
  sideEffects: 'side effects description',
  pregnancy: 'pregnancy and lactation description',
  precautions: 'precautions description',
  pediatric: 'pediatric usage description',
  overdose: 'overdose effects description',
  reconstitution: 'reconstitution description',
  storage: 'storage conditions description',
} as const;
export type MonographSection = keyof typeof MONOGRAPH_SECTIONS;

export const MONOGRAPH_SOURCE = 'Drug index (medex.com.bd export, 2022)';

/* ------------------------------------------------------------------ text -- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', deg: '°', micro: 'µ', plusmn: '±', times: '×', le: '≤', ge: '≥', frac12: '½', frac14: '¼', frac34: '¾', reg: '®', trade: '™' };

/** The source's HTML as readable text: paragraphs, "• " list items, entities decoded, its "Read more" teaser dropped. */
export function htmlToText(html: string): string {
  if (!html) return '';
  let s = html;
  // A long section is stored twice: a teaser (hidden) and the full text. Keep the full one.
  const full = s.indexOf('class="full-str"');
  if (full >= 0) s = s.slice(s.indexOf('>', full) + 1);
  s = s
    .replace(/<span[^>]*min-str-toggle[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, '^$1')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|h\d|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h\d[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/ /g, ' ')
    .replace(/\.\.\. Read more/g, '');
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .replace(/•\s*\n/g, '• ')
    // A list's items sit on consecutive lines, not apart.
    .replace(/\n{2,}(?=• )/g, '\n');
}

/* ---------------------------------------------------------------- names -- */

/** Words that name the salt or the water, not the medicine. */
const SALTS = new Set(
  'sodium potassium calcium magnesium hydrochloride hcl dihydrochloride hydrobromide trihydrate dihydrate monohydrate hemihydrate sesquihydrate anhydrous maleate dimaleate mesylate mesilate besylate besilate succinate tartrate bitartrate citrate sulphate sulfate phosphate acetate propionate dipropionate valerate fumarate hemifumarate bromide nitrate lactate disodium dipotassium hyclate pamoate embonate tromethamine trometamol furoate xinafoate monosodium pentahydrate hexahydrate oxalate bisulphate bisulfate'.split(' '),
);
/** When the first word is itself a mineral, the "salt" is the medicine: calcium carbonate is not calcium. */
const MINERALS = new Set('calcium sodium potassium magnesium ferrous ferric iron zinc aluminium aluminum lithium silver copper selenium chromium'.split(' '));

/** Water of crystallisation, which even a mineral salt can lose: zinc sulphate monohydrate is zinc sulphate. */
const HYDRATES = new Set('monohydrate dihydrate trihydrate pentahydrate hexahydrate heptahydrate hemihydrate anhydrous'.split(' '));

/** Spellings that differ by convention, fixed inside a word before anything else. */
const SPELLINGS: [RegExp, string][] = [
  [/sulf/g, 'sulph'],
  [/aciclovir/g, 'acyclovir'],
  [/flupenthixol/g, 'flupentixol'],
  [/phenobarbitone/g, 'phenobarbital'],
  [/cromoglycate/g, 'cromoglicate'],
];

const SYNONYMS: Record<string, string> = {
  zinc: 'zinc sulphate',
  'glyceryl trinitrate': 'nitroglycerin',
  'vitamin c': 'ascorbic acid',
  'vit c': 'ascorbic acid',
  'vitamin b1': 'thiamine',
  'vitamin b2': 'riboflavin',
  'vitamin b3': 'nicotinamide',
  niacinamide: 'nicotinamide',
  'vitamin b6': 'pyridoxine',
  'vitamin b12': 'cyanocobalamin',
  'vitamin d3': 'cholecalciferol',
  'vit d3': 'cholecalciferol',
  colecalciferol: 'cholecalciferol',
  'vitamin d2': 'ergocalciferol',
  'vitamin e': 'tocopherol',
  'alpha tocopherol': 'tocopherol',
  'vitamin a': 'retinol',
  'vitamin k1': 'phytomenadione',
  phytonadione: 'phytomenadione',
  acetaminophen: 'paracetamol',
  frusemide: 'furosemide',
  albuterol: 'salbutamol',
  amoxycillin: 'amoxicillin',
  cephalexin: 'cefalexin',
  cephradine: 'cefradine',
  'cefuroxime axetil': 'cefuroxime',
  'cefpodoxime proxetil': 'cefpodoxime',
  'clavulanic acid': 'clavulanate',
  'potassium clavulanate': 'clavulanate',
};

function component(raw: string): string {
  let c = raw
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, to] of SPELLINGS) c = c.replace(re, to);
  c = SYNONYMS[c] ?? c;
  const words = c.split(' ');
  if (words.length > 1) {
    const drop = MINERALS.has(words[0]) ? HYDRATES : SALTS;
    c = words.filter((w, i) => i === 0 || !drop.has(w)).join(' ');
  }
  c = SYNONYMS[c] ?? c;
  return c.replace(/ /g, '');
}

/** One key for a generic however it is written: components without salts or synonyms, in order. */
export function genericKey(name: string): string {
  return name
    .split(/\s*\+\s*|\s*,\s*|\s+and\s+/i)
    .filter(Boolean)
    .map(component)
    .filter(Boolean)
    .sort()
    .join('+');
}

/** The name in brackets, too: "Vitamin E [Alpha Tocopherol Acetate]" is also "Alpha Tocopherol Acetate". */
function keysOf(name: string): string[] {
  const keys = new Set([genericKey(name)]);
  const inner = /^[^+]*?[[(]([^\])]+)[\])]\s*$/.exec(name)?.[1];
  if (inner && !name.includes('+')) keys.add(genericKey(inner));
  return [...keys].filter(Boolean);
}

/* --------------------------------------------------------------- import -- */

type Row = Record<string, string>;

export async function importMonographs(opts: { medex: string; dryRun?: boolean; onProgress?: (m: string) => void }) {
  const matrix = parseCsv(await readFile(path.join(opts.medex, 'generic.csv'), 'utf8'));
  const [header, ...body] = matrix;
  const rows: Row[] = body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])));

  // Where two index rows reduce to one key, the fuller write-up wins.
  const filled = (r: Row) => Object.values(MONOGRAPH_SECTIONS).filter((c) => r[c]).length;
  const byKey = new Map<string, Row>();
  const exact = new Map<string, Row>();
  for (const r of rows) {
    exact.set(r['generic name'].toLowerCase().trim(), r);
    for (const k of keysOf(r['generic name'])) {
      const had = byKey.get(k);
      if (!had || filled(r) > filled(had)) byKey.set(k, r);
    }
  }

  const generics = await MedicineGenericModel.find({}).select('name').lean();
  let matched = 0;
  let byName = 0;
  const unmatched: string[] = [];
  const ops: Parameters<typeof MedicineGenericModel.bulkWrite>[0] = [];
  for (const g of generics) {
    const direct = exact.get(g.name.toLowerCase().trim());
    const r = direct ?? keysOf(g.name).map((k) => byKey.get(k)).find(Boolean);
    if (!r) {
      unmatched.push(g.name);
      continue;
    }
    matched++;
    if (direct) byName++;
    const monograph = Object.fromEntries(Object.entries(MONOGRAPH_SECTIONS).map(([k, col]) => [k, htmlToText(r[col] ?? '')]));
    ops.push({
      updateOne: {
        filter: { _id: g._id },
        update: {
          $set: {
            drugClass: r['drug class'] ?? '',
            monograph,
            monographSource: { name: MONOGRAPH_SOURCE, matchedAs: r['generic name'] },
          },
        },
      },
    });
  }
  if (!opts.dryRun) {
    for (let i = 0; i < ops.length; i += 500) {
      await MedicineGenericModel.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      opts.onProgress?.(`monographs: ${Math.min(i + 500, ops.length)} / ${ops.length}`);
    }
  }
  return { generics: generics.length, matched, matchedByExactName: byName, unmatched: unmatched.length, sampleUnmatched: unmatched.slice(0, 25) };
}
