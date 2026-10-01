import { describe, it, expect } from 'vitest';
import {
  duplicateFilter,
  touchesIdentity,
  medicineDeleteBlock,
  refDeleteBlock,
  activeFilter,
  pageWindow,
  isRefKind,
  DUPLICATE_MEDICINE,
} from '../src/services/catalogue.service.js';
import {
  medicineInputSchema,
  medicinePatchSchema,
  refNameSchema,
  approveRequestSchema,
  rejectRequestSchema,
} from '../src/validators/catalogue.validator.js';

/**
 * The shared catalogue's rules.
 *
 * One catalogue serves every shop on the deployment, so a duplicate row is a
 * brand that shows up twice in every counter's search, and a deleted row that a
 * shop stocks is a product pointing at nothing.
 */
const SQUARE = '64b000000000000000000001';

describe('what makes two catalogue rows the same product', () => {
  it('keys on the brand, case-blind', () => {
    // The importer and the console disagree about casing; "NAPA" is Napa.
    const f = duplicateFilter({ brandName: '  NAPA ', strength: '500 mg', companyId: SQUARE, dosageForm: 'Tablet' });
    expect(f.brandKey).toBe('napa');
    expect(f.strength).toBe('500 mg');
    expect(f.dosageForm).toBe('Tablet');
    expect(String(f.company)).toBe(SQUARE);
  });

  it('treats a missing strength, form or company as the same as a blank one', () => {
    const f = duplicateFilter({ brandName: 'Napa' });
    expect(f.strength).toEqual({ $in: ['', null] });
    expect(f.dosageForm).toEqual({ $in: ['', null] });
    expect(f.company).toEqual({ $in: [null] });
  });

  it('leaves the row being edited out of the check', () => {
    // Otherwise saving a row unchanged would clash with itself.
    const f = duplicateFilter({ brandName: 'Napa' }, SQUARE);
    expect(String((f._id as { $ne: unknown }).$ne)).toBe(SQUARE);
  });

  it('only rechecks when the edit touches the identity', () => {
    expect(touchesIdentity({ price: 12 })).toBe(false);
    expect(touchesIdentity({ description: 'x', isActive: false })).toBe(false);
    expect(touchesIdentity({ strength: '250 mg' })).toBe(true);
    expect(touchesIdentity({ companyId: null })).toBe(true);
  });

  it('says so in the words the console shows', () => {
    expect(DUPLICATE_MEDICINE).toBe('That medicine is already in the catalogue');
  });
});

describe('the delete guards', () => {
  it('lets a row no shop stocks be deleted', () => {
    expect(medicineDeleteBlock(0)).toBeNull();
  });

  it('refuses a row a shop stocks, and says what to do instead', () => {
    expect(medicineDeleteBlock(3)).toBe('3 shops stock this medicine — deactivate it instead');
    expect(medicineDeleteBlock(1)).toBe('1 shop stocks this medicine — deactivate it instead');
  });

  it('refuses a company, generic or group that a medicine uses', () => {
    expect(refDeleteBlock(0)).toBeNull();
    expect(refDeleteBlock(1)).toBe('Used by 1 medicine');
    expect(refDeleteBlock(42)).toBe('Used by 42 medicines');
  });
});

describe('the list filters', () => {
  it('reads active=true|false and treats anything else as both', () => {
    expect(activeFilter('true')).toBe(true);
    expect(activeFilter('false')).toBe(false);
    expect(activeFilter(undefined)).toBeUndefined();
    expect(activeFilter('yes')).toBeUndefined();
  });

  it('bounds the page window', () => {
    expect(pageWindow({})).toEqual({ page: 1, limit: 25, skip: 0 });
    expect(pageWindow({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20 });
    expect(pageWindow({ limit: 99_999 }).limit).toBe(100);
    expect(pageWindow({ page: -2, limit: 0 }, 50, 500)).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('knows the three reference lists and nothing else', () => {
    expect(isRefKind('companies')).toBe(true);
    expect(isRefKind('generics')).toBe(true);
    expect(isRefKind('groups')).toBe(true);
    expect(isRefKind('medicines')).toBe(false);
  });
});

describe('what the console may write', () => {
  const napa = { brandName: 'Napa', genericName: 'Paracetamol' };

  it('needs a brand and a generic', () => {
    expect(medicineInputSchema.safeParse(napa).success).toBe(true);
    expect(medicineInputSchema.safeParse({ brandName: 'Napa' }).success).toBe(false);
    expect(medicineInputSchema.safeParse({ ...napa, brandName: '   ' }).success).toBe(false);
    expect(medicineInputSchema.safeParse({ ...napa, brandName: 'x'.repeat(161) }).success).toBe(false);
  });

  it('takes null to clear a price or a link, and refuses a malformed id', () => {
    expect(medicineInputSchema.safeParse({ ...napa, price: null, companyId: null }).success).toBe(true);
    expect(medicineInputSchema.safeParse({ ...napa, price: -1 }).success).toBe(false);
    expect(medicineInputSchema.safeParse({ ...napa, companyId: 'square' }).success).toBe(false);
    expect(medicineInputSchema.safeParse({ ...napa, companyId: SQUARE }).success).toBe(true);
  });

  it('refuses an empty edit', () => {
    expect(medicinePatchSchema.safeParse({}).success).toBe(false);
    expect(medicinePatchSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('takes a name for a reference row', () => {
    expect(refNameSchema.safeParse({ name: 'Square Pharmaceuticals PLC' }).success).toBe(true);
    expect(refNameSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('approves by linking a row or by creating one', () => {
    expect(approveRequestSchema.safeParse({ medicineId: SQUARE }).success).toBe(true);
    expect(approveRequestSchema.safeParse({ medicine: napa }).success).toBe(true);
    expect(approveRequestSchema.safeParse({}).success).toBe(false);
    expect(approveRequestSchema.safeParse({ medicine: { brandName: 'Napa' } }).success).toBe(false);
  });

  it('wants a reason to reject, and not an essay', () => {
    expect(rejectRequestSchema.safeParse({ reason: 'Not registered with DGDA' }).success).toBe(true);
    expect(rejectRequestSchema.safeParse({ reason: ' ' }).success).toBe(false);
    expect(rejectRequestSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false);
  });
});
