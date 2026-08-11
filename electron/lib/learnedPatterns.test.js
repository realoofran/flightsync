import { describe, it, expect } from 'vitest';
import { buildCorpusTokenCounts, recordLearnedPattern, lookupLearnedValue } from './learnedPatterns.js';

describe('recordLearnedPattern / lookupLearnedValue', () => {
  it('learns a distinctive word and applies it to future text containing that word', () => {
    const table = {};
    recordLearnedPattern(table, 'obscurestudio-sunexpress-a320-repaint', 'SXS');
    expect(lookupLearnedValue(table, 'anotherfolder-sunexpress-a321-livery')).toBe('SXS');
  });

  it('never learns from generic addon-packaging stopwords', () => {
    const table = {};
    recordLearnedPattern(table, 'community scenery package official edition', 'EDDM');
    expect(Object.keys(table)).toEqual([]);
  });

  it('never learns from short words below the minimum length', () => {
    const table = {};
    recordLearnedPattern(table, 'abc xyz', 'EDDM');
    expect(Object.keys(table)).toEqual([]);
  });

  it('skips a token that is not distinctive across the library (appears in >1 addon)', () => {
    const corpus = buildCorpusTokenCounts([
      { folderName: 'flybywire-sunexpress-a320', title: '' },
      { folderName: 'flybywire-turkish-a321', title: '' },
    ]);
    const table = {};
    // "flybywire" appears in 2 addons in the corpus — not distinctive, should be skipped.
    // "sunexpress" appears in only 1 — distinctive, should be learned.
    recordLearnedPattern(table, 'flybywire-sunexpress-a320', 'SXS', corpus);
    expect(table.flybywire).toBeUndefined();
    expect(table.sunexpress).toBe('SXS');
  });

  it('returns null (never guesses) when matching tokens disagree on the value', () => {
    const table = { sunexpress: 'SXS', discount: 'ABC' };
    expect(lookupLearnedValue(table, 'sunexpress-discount-fares')).toBeNull();
  });

  it('returns null for text with no learned tokens', () => {
    const table = { sunexpress: 'SXS' };
    expect(lookupLearnedValue(table, 'completely-unrelated-folder')).toBeNull();
  });

  it('is a no-op when recording a falsy value', () => {
    const table = {};
    recordLearnedPattern(table, 'sunexpress-a320-livery', null);
    expect(Object.keys(table)).toEqual([]);
  });
});

describe('buildCorpusTokenCounts', () => {
  it('counts significant tokens across folderName + title for every addon', () => {
    const counts = buildCorpusTokenCounts([
      { folderName: 'skysim-eddm-munich', title: 'Munich Xtreme' },
      { folderName: 'skysim-eddf-frankfurt', title: 'Frankfurt Xtreme' },
    ]);
    expect(counts.get('skysim')).toBe(2);
    expect(counts.get('xtreme')).toBe(2);
    expect(counts.get('munich')).toBe(1);
    expect(counts.get('frankfurt')).toBe(1);
  });
});
