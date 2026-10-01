import { describe, it, expect } from 'vitest';
import {
  sameRequest,
  pendingCapMessage,
  isRequestStatus,
  MAX_PENDING_PER_SHOP,
  DUPLICATE_REQUEST,
} from '../src/services/medicineRequest.service.js';
import { medicineRequestSchema } from '../src/validators/catalogue.validator.js';

/**
 * A shop asking for a medicine the catalogue does not have.
 *
 * The queue is read by people, so the same shop asking twice for the same
 * strip is one request, and a shop cannot bury it under hundreds.
 */
describe('one request per strip', () => {
  it('sees the same brand and strength typed twice as one request', () => {
    expect(sameRequest({ brandName: 'Napa Extend', strength: '665mg' }, { brandName: 'napa extend', strength: '665 mg' })).toBe(true);
  });

  it('treats a different strength as a different request', () => {
    expect(sameRequest({ brandName: 'Napa', strength: '500 mg' }, { brandName: 'Napa', strength: '120 mg/5 ml' })).toBe(false);
  });

  it('treats no strength on both sides as the same', () => {
    expect(sameRequest({ brandName: 'Orsaline-N' }, { brandName: 'Orsaline-N', strength: '' })).toBe(true);
  });

  it('says so plainly', () => {
    expect(DUPLICATE_REQUEST).toBe('You have already asked for this one');
  });
});

describe('the cap', () => {
  it('lets a shop ask until thirty are waiting', () => {
    expect(MAX_PENDING_PER_SHOP).toBe(30);
    expect(pendingCapMessage(0)).toBeNull();
    expect(pendingCapMessage(29)).toBeNull();
    expect(pendingCapMessage(30)).toMatch(/30 requests waiting/);
  });
});

describe('what a shop may send', () => {
  it('needs a brand and nothing else', () => {
    expect(medicineRequestSchema.safeParse({ brandName: 'Seclo' }).success).toBe(true);
    expect(medicineRequestSchema.safeParse({}).success).toBe(false);
    expect(medicineRequestSchema.safeParse({ brandName: '  ' }).success).toBe(false);
  });

  it('caps the note', () => {
    expect(medicineRequestSchema.safeParse({ brandName: 'Seclo', note: 'x'.repeat(500) }).success).toBe(true);
    expect(medicineRequestSchema.safeParse({ brandName: 'Seclo', note: 'x'.repeat(501) }).success).toBe(false);
  });

  it('does not let the body pick the shop', () => {
    // Tenancy comes from the signed-in user. A stray `organization` is dropped,
    // not stored.
    const parsed = medicineRequestSchema.parse({ brandName: 'Seclo', organization: '64b000000000000000000001' });
    expect('organization' in parsed).toBe(false);
  });

  it('knows the three states', () => {
    for (const s of ['pending', 'added', 'rejected']) expect(isRequestStatus(s)).toBe(true);
    expect(isRequestStatus('approved')).toBe(false);
  });
});
