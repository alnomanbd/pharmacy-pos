import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { branchMatch, inScope, writeBranchOf } from '../src/services/branchScope.service.js';

const a = new Types.ObjectId();
const b = new Types.ObjectId();

describe('branch scope', () => {
  it('reads every branch when nothing narrows it', () => {
    expect(branchMatch(null)).toEqual({});
    expect(branchMatch({ show: null, write: null, count: 2 })).toEqual({});
  });

  it('reads one branch, or the few somebody works in', () => {
    expect(branchMatch({ show: [a], write: a, count: 2 })).toEqual({ branch: a });
    expect(branchMatch({ show: [a, b], write: null, count: 3 })).toEqual({ branch: { $in: [a, b] } });
  });

  it('keeps a record from another branch out of reach', () => {
    const scope = { show: [a], write: a, count: 2 };
    expect(inScope(scope, a)).toBe(true);
    expect(inScope(scope, b)).toBe(false);
    // Records from before branches existed, and an unnarrowed scope, are always in reach.
    expect(inScope(scope, null)).toBe(true);
    expect(inScope({ show: null, write: null, count: 2 }, b)).toBe(true);
  });

  it('writes into the branch picked', async () => {
    expect(await writeBranchOf({ org: String(new Types.ObjectId()), branch: { show: [a], write: a, count: 2 } })).toBe(a);
  });

  it('asks for a branch before writing from "All branches"', async () => {
    await expect(
      writeBranchOf({ org: String(new Types.ObjectId()), branch: { show: null, write: null, count: 2 } }),
    ).rejects.toThrow(/Pick a branch/);
  });
});
