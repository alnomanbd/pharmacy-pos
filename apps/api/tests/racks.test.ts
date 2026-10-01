import { describe, it, expect } from 'vitest';
import { rackFor } from '../src/services/shop.service.js';

/**
 * Which shelf an item is offered.
 *
 * No two pharmacies rack their stock the same way — some by what the medicine
 * is, some by which company made it, some by nothing anybody could write down —
 * so the rule is a suggestion and these tests pin what it suggests.
 */
const racks = [
  { _id: 'r1', name: 'Syrup shelf', rule: 'form', match: ['syrup', 'suspension', 'drops'] },
  { _id: 'r2', name: 'Square rack', rule: 'company', match: ['square'] },
  { _id: 'r3', name: 'R2-A', rule: 'manual', match: [] },
];

describe('which rack an item belongs on', () => {
  it('puts a syrup on the syrup shelf', () => {
    expect(rackFor(racks, { dosageForm: 'Syrup' })?.name).toBe('Syrup shelf');
  });

  it('matches a form written a little differently', () => {
    // Catalogues say "Oral Suspension", shops say "suspension".
    expect(rackFor(racks, { dosageForm: 'Oral Suspension' })?.name).toBe('Syrup shelf');
  });

  it('puts a company’s tablet on that company’s rack', () => {
    expect(rackFor(racks, { dosageForm: 'Tablet', companyName: 'Square Pharma' })?.name).toBe(
      'Square rack',
    );
  });

  it('prefers the form shelf when both could claim it', () => {
    /*
     * A shop with a syrup shelf has one for a reason: everything liquid is in
     * one place. Putting Square's syrup on the Square rack instead defeats the
     * arrangement it asked for.
     */
    expect(rackFor(racks, { dosageForm: 'Syrup', companyName: 'Square Pharma' })?.name).toBe(
      'Syrup shelf',
    );
  });

  it('offers nothing rather than guessing', () => {
    // Better an item with no shelf than one filed where nobody will look.
    expect(rackFor(racks, { dosageForm: 'Tablet', companyName: 'Incepta' })).toBeNull();
    expect(rackFor(racks, {})).toBeNull();
  });

  it('never offers a manual shelf, which is somebody’s own filing', () => {
    expect(rackFor([{ _id: 'r3', name: 'R2-A', rule: 'manual', match: ['tablet'] }], {
      dosageForm: 'Tablet',
    })).toBeNull();
  });
});
