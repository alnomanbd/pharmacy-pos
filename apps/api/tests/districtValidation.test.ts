import { describe, expect, it } from 'vitest';
import { createOrganizationSchema, registerSchema, shopProfileSchema } from '../src/validators/auth.validator.js';

describe('a district from the list', () => {
  it('is stored as the official spelling, and anything else is refused', () => {
    expect(shopProfileSchema.parse({ address: { district: ' Bogra ' } }).address?.district).toBe('Bogura');
    expect(shopProfileSchema.parse({ address: { district: '' } }).address?.district).toBe('');
    expect(shopProfileSchema.safeParse({ address: { district: 'Mirpur' } }).success).toBe(false);
  });

  it('is optional at sign-up', () => {
    const base = { organizationName: 'Test Shop', name: 'Test Owner', email: 'a@b.co', phone: '01711111111', password: 'Strong#Pass91', acceptTerms: true };
    expect(registerSchema.parse(base).district).toBeUndefined();
    expect(registerSchema.parse({ ...base, district: 'চট্টগ্রাম' }).district).toBe('Chattogram');
  });
});

describe('a shop address', () => {
  it('takes its division from the district and its upazila from that district', () => {
    const a = shopProfileSchema.parse({ address: { district: 'Bogra', upazila: 'sherpur', street: 'Satmatha' } }).address;
    expect(a).toMatchObject({ district: 'Bogura', division: 'Rajshahi', upazila: 'Sherpur', street: 'Satmatha' });
    expect(createOrganizationSchema.shape.address.parse({ district: 'ঢাকা', upazila: 'Dhaka North City' })).toMatchObject({ division: 'Dhaka', upazila: 'Dhaka North City' });
  });

  it('refuses an upazila from another district, or with no district', () => {
    expect(shopProfileSchema.safeParse({ address: { district: 'Bogura', upazila: 'Savar' } }).success).toBe(false);
    expect(shopProfileSchema.safeParse({ address: { upazila: 'Savar' } }).success).toBe(false);
  });

  it('clears the division and upazila with the district', () => {
    expect(shopProfileSchema.parse({ address: { district: '', upazila: '' } }).address).toMatchObject({ district: '', division: '', upazila: '' });
  });
});
