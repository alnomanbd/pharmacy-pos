/**
 * The counter calculator's arithmetic.
 *
 * A shop calculator, not a scientific one: + − × ÷ with the usual precedence,
 * and `%` the way every calculator on a Bangladeshi counter does it — `200 + 10%`
 * is 220 (ten percent *of what came before*), while `10%` on its own, or after
 * × or ÷, is a tenth of ten. Parsed by hand rather than handed to `eval`, so
 * nothing typed is ever run as code.
 */

export type Op = '+' | '-' | '×' | '÷';
export const OPS: Op[] = ['+', '-', '×', '÷'];

/** What a typed character means, if anything: `*` and `x` are ×, `/` is ÷. */
export function opFor(ch: string): Op | null {
  if (ch === '+') return '+';
  if (ch === '-' || ch === '−') return '-';
  if (ch === '*' || ch === 'x' || ch === 'X' || ch === '×') return '×';
  if (ch === '/' || ch === '÷') return '÷';
  return null;
}

interface Factor {
  value: number;
  percent: boolean;
}

/**
 * Splits `120×3+45%` into numbers and operators. A trailing operator is
 * ignored, so the answer shows while the next number is still being typed.
 */
function tokens(expr: string): (number | Op | '%')[] | null {
  const out: (number | Op | '%')[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const text = expr.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1) return null;
      out.push(text === '.' ? 0 : Number(text));
      i = j;
      continue;
    }
    if (ch === '%') {
      out.push('%');
      i++;
      continue;
    }
    const op = opFor(ch);
    if (!op) return null;
    out.push(op);
    i++;
  }
  // Drop what is still being typed: `12+` reads as 12.
  while (out.length && typeof out[out.length - 1] === 'string' && out[out.length - 1] !== '%') out.pop();
  return out;
}

/** The value of an expression, or null when it cannot be read or divides by nothing. */
export function evaluate(expr: string): number | null {
  const list = tokens(expr.replace(/\s+/g, ''));
  if (!list || list.length === 0) return null;

  // Terms joined by + and −, each a run of factors joined by × and ÷.
  let total = 0;
  let sign = 1;
  let i = 0;
  let first = true;
  // A leading minus: −5 + 3.
  if (list[0] === '-') {
    sign = -1;
    i = 1;
  } else if (list[0] === '+') i = 1;

  while (i < list.length) {
    const factors: Factor[] = [];
    const ops: Op[] = [];
    for (;;) {
      const n = list[i];
      if (typeof n !== 'number') return null;
      i++;
      const percent = list[i] === '%';
      if (percent) i++;
      factors.push({ value: n, percent });
      const next = list[i];
      if (next === '×' || next === '÷') {
        ops.push(next);
        i++;
        continue;
      }
      break;
    }

    let term: number;
    if (factors.length === 1 && factors[0].percent && !first) {
      // `200 + 10%`: ten percent of what came before.
      term = (total * factors[0].value) / 100;
    } else {
      term = factors[0].percent ? factors[0].value / 100 : factors[0].value;
      for (let k = 0; k < ops.length; k++) {
        const f = factors[k + 1];
        const v = f.percent ? f.value / 100 : f.value;
        if (ops[k] === '×') term *= v;
        else {
          if (v === 0) return null;
          term /= v;
        }
      }
    }
    total += sign * term;
    first = false;

    const next = list[i];
    if (next === undefined) break;
    if (next !== '+' && next !== '-') return null;
    sign = next === '+' ? 1 : -1;
    i++;
  }

  if (!Number.isFinite(total)) return null;
  // 0.1 + 0.2 is 0.3 at a counter.
  return Math.round(total * 1e10) / 1e10;
}

/** A result as a counter reads it: no trailing zeros, at most four decimals. */
export function shown(n: number): string {
  const rounded = Math.round(n * 1e4) / 1e4;
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 4 });
}

/** The same, plain, for a field that takes a number: `1234.5`, not `1,234.5`. */
export function plain(n: number): string {
  return String(Math.round(n * 100) / 100);
}
