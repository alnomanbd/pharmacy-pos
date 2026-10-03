import { describe, it, expect } from 'vitest';
import { districtOf } from '../src/services/medicineDemand.service.js';

describe('the district a shop is counted in', () => {
  it('uses the district, tidied, else the city', () => {
    expect(districtOf({ district: '  dhaka ', city: 'Mirpur' })).toBe('Dhaka');
    expect(districtOf({ district: 'COX’S BAZAR district' })).toBe("Cox's Bazar");
    expect(districtOf({ district: '', city: 'bogura' })).toBe('Bogura');
  });
  it('is Unknown when the shop never said', () => {
    expect(districtOf({})).toBe('Unknown');
    expect(districtOf(null)).toBe('Unknown');
  });
});
