import { describe, it, expect } from 'vitest';
import { pageList } from './Pager';

describe('the pager', () => {
  it('shows every page when there are only a few', () => {
    expect(pageList(1, 3)).toEqual([1, 2, 3]);
  });

  it('keeps the ends and the neighbours, with gaps between', () => {
    expect(pageList(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
  });

  it('does not put a gap where nothing is skipped', () => {
    expect(pageList(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageList(1, 6)).toEqual([1, 2, '…', 6]);
  });
});
