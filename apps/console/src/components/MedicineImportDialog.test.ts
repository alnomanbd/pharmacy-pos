import { describe, it, expect } from 'vitest';
import { batches } from './MedicineImportDialog';
import type { SheetRow } from '../lib/spreadsheet';

/** A row as `applyMapping` makes one: its spreadsheet line, then its cells. */
const row = (line: number, cells: Record<string, string>): SheetRow => Object.assign({ _line: line } as SheetRow, cells);

/** Cutting a big file into requests the API will take. */
describe('import batches', () => {
  it('keeps every row, in order', () => {
    const rows = Array.from({ length: 1234 }, (_, i) => row(i + 2, { brandName: `B${i}` }));
    const parts = batches(rows);
    expect(parts.flat().map((r) => r._line)).toEqual(rows.map((r) => r._line));
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(500);
  });

  it('splits by size as well, so long indications stay under the 1 MB limit', () => {
    const long = 'ক'.repeat(4000);
    const rows = Array.from({ length: 300 }, (_, i) => row(i + 2, { brandName: `B${i}`, indications: long }));
    for (const part of batches(rows)) {
      expect(new TextEncoder().encode(JSON.stringify({ rows: part })).length).toBeLessThan(1024 * 1024);
    }
  });
});
