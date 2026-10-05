import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * `stop` and `num` from useNumerals() must be declared wherever they are used.
 *
 * `stop` is also the browser's global `window.stop`, so TypeScript accepts a
 * `${stop}` whose useNumerals() call was forgotten — and the screen then prints
 * "function stop() { [native code] }" in the middle of a sentence. This walks
 * every file and checks each use resolves to a declaration in an enclosing
 * function.
 */
const ROOT = path.resolve(__dirname, '..');

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

function declares(scope: ts.Node, name: string): boolean {
  let found = false;
  if (ts.isFunctionLike(scope)) for (const p of scope.parameters) if (p.name.getText().includes(name)) found = true;
  const look = (n: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(n)) {
      if (ts.isIdentifier(n.name) && n.name.text === name) found = true;
      if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) if (el.name.getText() === name) found = true;
    }
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = true;
    if (n !== scope && ts.isFunctionLike(n)) return;
    ts.forEachChild(n, look);
  };
  ts.forEachChild(scope, look);
  return found;
}

describe('numbers and full stops in built sentences', () => {
  it('every ${stop} and num() is declared — never the browser’s window.stop', () => {
    const undeclared: string[] = [];
    for (const file of files(ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (!/\$\{stop\}|\bnum\(/.test(src)) continue;
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && (n.text === 'stop' || n.text === 'num')) {
          const use =
            (n.text === 'stop' && ts.isTemplateSpan(n.parent)) ||
            (n.text === 'num' && ts.isCallExpression(n.parent) && n.parent.expression === n);
          if (use) {
            let s: ts.Node | undefined = n.parent;
            let ok = false;
            while (s) {
              if ((ts.isFunctionLike(s) || ts.isSourceFile(s)) && declares(s, n.text)) {
                ok = true;
                break;
              }
              s = s.parent;
            }
            if (!ok) undeclared.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.text}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(undeclared).toEqual([]);
  });
});
