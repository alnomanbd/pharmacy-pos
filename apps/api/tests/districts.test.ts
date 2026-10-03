import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DISTRICTS, canonicalDistrict } from '../src/utils/districts.js';
import { districtOf } from '../src/services/medicineDemand.service.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const listOf = (p: string) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n').split('// ---- the list ----')[1];

describe('districts', () => {
  it('has all 64, once each', () => {
    expect(DISTRICTS).toHaveLength(64);
    expect(new Set(DISTRICTS.map((d) => d.name)).size).toBe(64);
  });

  it('reads old spellings, Bangla and stray words as the one district', () => {
    expect(canonicalDistrict('Bogra')).toBe('Bogura');
    expect(canonicalDistrict('বগুড়া')).toBe('Bogura');
    expect(canonicalDistrict('chittagong')).toBe('Chattogram');
    expect(canonicalDistrict('Comilla District')).toBe('Cumilla');
    expect(canonicalDistrict("cox's bazar")).toBe("Cox's Bazar");
    expect(canonicalDistrict('Jessore Sadar')).toBe('Jashore');
    expect(canonicalDistrict('ঢাকা জেলা')).toBe('Dhaka');
    expect(canonicalDistrict('Mirpur')).toBeNull();
    expect(canonicalDistrict('')).toBeNull();
  });

  it('counts a shop in the district it named, else its city, else Unknown', () => {
    expect(districtOf({ district: 'Bogra' })).toBe('Bogura');
    expect(districtOf({ district: '', city: 'Chittagong' })).toBe('Chattogram');
    expect(districtOf({ district: 'Somewhere', city: 'Dhaka' })).toBe('Dhaka');
    expect(districtOf({ district: 'Somewhere' })).toBe('Unknown');
    expect(districtOf(null)).toBe('Unknown');
  });

  it('the shop app, console, site and data API carry the same list', () => {
    const api = listOf('../src/utils/districts.ts');
    expect(listOf('../../../packages/shared/src/lib/districts.ts')).toBe(api);
    expect(listOf('../../site/src/lib/districts.ts')).toBe(api);
    expect(listOf('../../data-api/src/lib/districts.ts')).toBe(api);
  });
});
