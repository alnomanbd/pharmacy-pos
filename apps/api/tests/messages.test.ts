import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { translateMessage } from '../src/i18n/messages.js';
import { BN_MESSAGES, BN_NOUNS } from '../src/i18n/messages.bn.js';

/** The API's refusals, in Bangla when the shop's screen is in Bangla. */
describe('translateMessage', () => {
  it('says a known message in Bangla', () => {
    expect(translateMessage('Nothing on the bill', 'bn')).toBe('বিলে কিছু নেই।');
  });

  it('says "X not found" with the Bangla name', () => {
    expect(translateMessage('Customer not found', 'bn')).toBe('কাস্টমার পাওয়া যায়নি।');
  });

  it('puts the values where the Bangla word order wants them', () => {
    // English: {0} = who, {1} = the counter; the Bangla names the counter first.
    expect(translateMessage('Rahim already has the POS open on Front desk', 'bn')).toBe(
      'Front desk-এ Rahim আগেই POS খুলে রেখেছেন।',
    );
    expect(translateMessage('Only 3 of Napa 500 (batch B12) are here', 'bn')).toBe('Napa 500 (ব্যাচ B12) এখানে আছে মাত্র 3টি।');
  });

  it('translates a value that is one of the API’s own names', () => {
    expect(translateMessage('Supplier in the Recycle Bin not found', 'bn')).toBe('রিসাইকেল বিনে সাপ্লায়ার পাওয়া যায়নি।');
    expect(translateMessage('An order that is sent cannot be marked open', 'bn')).toBe(
      'অর্ডারটি এখন “এসআর-কে দেওয়া” — একে “খোলা” করা যায় না।',
    );
  });

  it('prefers a full sentence over the noun form', () => {
    expect(translateMessage('That user is not in this shop not found', 'bn')).toBe('এই ব্যবহারকারী এই দোকানের নয়।');
  });

  it('leaves an unknown message as it was', () => {
    expect(translateMessage('Something nobody has written yet', 'bn')).toBe('Something nobody has written yet');
    expect(translateMessage('constructor', 'bn')).toBe('constructor');
    // An unknown name keeps its English inside the Bangla shape — never Object.prototype's.
    expect(translateMessage('constructor not found', 'bn')).toBe('constructor পাওয়া যায়নি।');
  });

  it('leaves English screens in English', () => {
    expect(translateMessage('Nothing on the bill', 'en')).toBe('Nothing on the bill');
    expect(translateMessage('Customer not found', undefined)).toBe('Customer not found');
  });

  it('says the reasons sent back in response data', () => {
    expect(translateMessage('no phone number', 'bn')).toBe('ফোন নম্বর নেই');
    expect(translateMessage('That code has expired.', 'bn')).toBe('এই কোডের মেয়াদ শেষ।');
    expect(translateMessage('Pieces per strip is not a number', 'bn')).toBe('পাতায় পিস সংখ্যা নয়');
  });
});

/* ------------------------------------------------------------------ */
/* Every message the code can refuse with has its Bangla.             */
/* ------------------------------------------------------------------ */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const CALLS = new Set(['badRequest', 'notFound', 'conflict', 'forbidden', 'unauthorized', 'tooMany', 'paymentRequired', 'gone']);

function walk(dir: string, out: string[] = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'seed' && f !== 'scripts') walk(p, out);
    } else if (f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** A message argument as the dictionary keys it: `${x}` becomes {0}, {1}…; a conditional gives both branches. */
function templatesOf(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    node.templateSpans.forEach((span, i) => (s += `{${i}}${span.literal.text}`));
    return [s];
  }
  if (ts.isConditionalExpression(node)) return [...templatesOf(node.whenTrue), ...templatesOf(node.whenFalse)];
  if (ts.isParenthesizedExpression(node)) return templatesOf(node.expression);
  return [];
}

function extract() {
  const messages = new Map<string, string>();
  const nouns = new Map<string, string>();
  for (const file of walk(SRC)) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    const visit = (n: ts.Node) => {
      let fn: string | null = null;
      let arg: ts.Node | undefined;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CALLS.has(n.expression.text)) {
        fn = n.expression.text;
        arg = n.arguments[0];
      } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'AppError') {
        fn = 'AppError';
        arg = n.arguments?.[2];
      }
      if (fn && arg) {
        const where = `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
        for (const m of templatesOf(arg)) (fn === 'notFound' ? nouns : messages).set(m, where);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { messages, nouns };
}

describe('the Bangla dictionary', () => {
  const { messages, nouns } = extract();

  it('finds the messages to check', () => {
    expect(messages.size).toBeGreaterThan(200);
    expect(nouns.size).toBeGreaterThan(30);
  });

  it('has every refusal the code writes', () => {
    const missing = [...messages].filter(([m]) => !Object.hasOwn(BN_MESSAGES, m)).map(([m, w]) => `${m}  ← ${w}`);
    expect(missing).toEqual([]);
  });

  it('has every name passed to notFound()', () => {
    const missing = [...nouns].filter(([n]) => !Object.hasOwn(BN_NOUNS, n)).map(([n, w]) => `${n}  ← ${w}`);
    expect(missing).toEqual([]);
  });

  it('uses only the blanks its English has', () => {
    const wrong = Object.entries(BN_MESSAGES).filter(([en, bn]) => {
      const have = new Set([...en.matchAll(/\{(\d+)\}/g)].map((m) => m[1]));
      return [...bn.matchAll(/\{(\d+)\}/g)].some((m) => !have.has(m[1]));
    });
    expect(wrong).toEqual([]);
  });
});
