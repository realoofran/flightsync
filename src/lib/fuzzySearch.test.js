import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyFilter } from './fuzzySearch.js';

describe('fuzzyScore', () => {
  it('ranks an exact match highest, then prefix, then substring, then subsequence', () => {
    const exact = fuzzyScore('eddm', 'EDDM');
    const prefix = fuzzyScore('eddm', 'EDDM Munich');
    const substring = fuzzyScore('eddm', 'Airport EDDM Enhanced');
    const subsequence = fuzzyScore('edm', 'EDDM'); // skips one D — still matches in order
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThanOrEqual(0);
  });

  it('returns -1 when characters are out of order (not a valid subsequence)', () => {
    expect(fuzzyScore('mde', 'EDDM')).toBe(-1);
  });

  it('returns 0 for an empty query (matches everything, ranks nothing)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('returns -1 for empty/missing target text', () => {
    expect(fuzzyScore('a', '')).toBe(-1);
    expect(fuzzyScore('a', null)).toBe(-1);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('EDDM', 'eddm')).toBe(fuzzyScore('eddm', 'EDDM'));
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { name: 'Turkish Airlines A321neo' },
    { name: 'Munich Airport EDDM' },
    { name: 'Frankfurt Airport EDDF' },
  ];

  it('returns unfiltered items in original order for an empty query', () => {
    expect(fuzzyFilter('', items, (i) => i.name)).toEqual(items);
  });

  it('filters out non-matches and ranks the best match first', () => {
    const result = fuzzyFilter('eddm', items, (i) => i.name);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Munich Airport EDDM');
  });

  it('matches across multiple items, best first', () => {
    const result = fuzzyFilter('airport', items, (i) => i.name);
    expect(result.map((r) => r.name)).toEqual(['Munich Airport EDDM', 'Frankfurt Airport EDDF']);
  });
});
