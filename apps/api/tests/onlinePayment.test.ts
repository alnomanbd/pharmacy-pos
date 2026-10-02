import { describe, it, expect } from 'vitest';
import { judgeValidation, methodFromCardType } from '../src/services/onlinePayment.service.js';

/**
 * Online payment through SSLCommerz: what makes a validation answer pay for a
 * payment. Everything posted by a browser is untrusted; this is the check.
 */
const p = { id: '6abf00000000000000000001', amount: 3000, currency: 'BDT' };
const valid = { status: 'VALID', tran_id: p.id, val_id: 'v1', amount: '3000.00', currency: 'BDT' };

describe('accepting an online payment', () => {
  it('accepts a VALID (or already VALIDATED) answer for this order, this amount, in taka', () => {
    expect(judgeValidation(valid, p)).toEqual({ ok: true });
    expect(judgeValidation({ ...valid, status: 'VALIDATED' }, p)).toEqual({ ok: true });
  });

  it('refuses no answer, or a payment that is not complete', () => {
    expect(judgeValidation(null, p).ok).toBe(false);
    expect(judgeValidation({ ...valid, status: 'FAILED' }, p)).toMatchObject({ ok: false, reason: expect.stringMatching(/FAILED/) });
    expect(judgeValidation({ ...valid, status: 'INVALID_TRANSACTION' }, p).ok).toBe(false);
  });

  it('refuses another order’s payment — a val_id copied from a cheaper checkout', () => {
    expect(judgeValidation({ ...valid, tran_id: '6abf00000000000000000002' }, p)).toMatchObject({ ok: false, reason: expect.stringMatching(/different order/) });
  });

  it('refuses a different amount or currency', () => {
    expect(judgeValidation({ ...valid, amount: '30.00' }, p)).toMatchObject({ ok: false, reason: expect.stringMatching(/received 30/) });
    expect(judgeValidation({ ...valid, currency: 'USD' }, p).ok).toBe(false);
    expect(judgeValidation({ ...valid, amount: '3000.40' }, p).ok).toBe(true);
  });
});

describe('which method it was', () => {
  it('reads SSLCommerz’s card_type', () => {
    expect(methodFromCardType('BKASH-BKash')).toBe('bkash');
    expect(methodFromCardType('NAGAD-Nagad')).toBe('nagad');
    expect(methodFromCardType('DBBLMOBILEB-Dbbl Mobile Banking')).toBe('rocket');
    expect(methodFromCardType('VISA-Dutch Bangla')).toBe('card');
    expect(methodFromCardType('IBBL-Internet Banking')).toBe('bank');
  });
});
