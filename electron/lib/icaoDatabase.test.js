import { describe, it, expect } from 'vitest';
import { extractIcaoCodes, resolveConfidentIcao } from './icaoDatabase.js';

describe('extractIcaoCodes', () => {
  it('finds a bare ICAO code in a typical addon folder name', () => {
    expect(extractIcaoCodes('fspro-eddm-munich')).toContain('EDDM');
  });

  it('filters known false-positive studio tags', () => {
    // Regression case from PLAN.md: "orbx-ltfm-istanbul" used to match both
    // the real ICAO (LTFM) and the studio tag (ORBX).
    const found = extractIcaoCodes('orbx-ltfm-istanbul');
    expect(found).toContain('LTFM');
    expect(found).not.toContain('ORBX');
  });

  it('resolves known airport names with no bare ICAO in the text', () => {
    expect(extractIcaoCodes('Franz Josef Strauss Enhanced')).toContain('EDDM');
  });

  it('returns an empty array for empty/falsy input', () => {
    expect(extractIcaoCodes('')).toEqual([]);
    expect(extractIcaoCodes(null)).toEqual([]);
  });

  it('matches known airport names across hyphen/underscore word separators', () => {
    // Regression: "cologne bonn" (space-separated key) never matched
    // "eddk-cologne-bonn" (hyphen-separated folder name) before separators
    // were normalized.
    expect(extractIcaoCodes('aerosoft-airport-eddk-cologne-bonn')).toContain('EDDK');
  });

  it('filters generic airport/name-fragment false positives found in real confirm queues', () => {
    expect(extractIcaoCodes('aeksimulations-airport-ltdx-cukurova-intl')).not.toContain('INTL');
    expect(extractIcaoCodes('dfflyerdirect-city-frankfurt')).not.toContain('CITY');
    expect(extractIcaoCodes('cr-edfs-schweinfurt-sued')).not.toContain('SUED');
    expect(extractIcaoCodes('flightbeam-airport-kmsp-minneapolis-st-paul')).not.toContain('PAUL');
  });
});

describe('resolveConfidentIcao', () => {
  it('auto-resolves the only candidate', () => {
    expect(resolveConfidentIcao('fspro-eddm-munich', ['EDDM'])).toBe('EDDM');
  });

  it('returns null with zero candidates', () => {
    expect(resolveConfidentIcao('some random text', [])).toBeNull();
  });

  it('resolves a bracketed code among ambiguous candidates', () => {
    expect(resolveConfidentIcao('[EDDM] Munich Enhanced', ['EDDM', 'TRUE'])).toBe('EDDM');
  });

  it('resolves a string-leading code', () => {
    expect(resolveConfidentIcao('EDDM - Munich Airport', ['EDDM', 'REAL'])).toBe('EDDM');
  });

  it('resolves via known-name corroboration', () => {
    expect(resolveConfidentIcao('LTFM Istanbul Airport Enhanced', ['LTFM', 'GOLD'])).toBe('LTFM');
  });

  it('resolves via corroboration across hyphen-separated folder names', () => {
    // Real regression: "aerosoft-airport-eddk-cologne-bonn" produces two raw
    // candidates (EDDK, and the incidental 4-letter word BONN), and used to
    // stay ambiguous because the name-table corroboration check didn't
    // normalize hyphens to spaces before matching "cologne bonn"/"bonn".
    const text = 'aerosoft-airport-eddk-cologne-bonn';
    const candidates = extractIcaoCodes(text);
    expect(candidates.sort()).toEqual(['BONN', 'EDDK']);
    expect(resolveConfidentIcao(text, candidates)).toBe('EDDK');
  });

  it('stays ambiguous for two equally unpositioned candidates (OTHH/DOHA case)', () => {
    // Regression case from icaoDatabase.js comments: "OTHH-Doha" resolves
    // OTHH from the regex and OTHH again from the name table, which is fine
    // (same code) — but a genuinely ambiguous pair of *different* codes with
    // no strong positional signal must fall through to manual confirm.
    const result = resolveConfidentIcao('generic-addon-name', ['EDDM', 'EDDF']);
    expect(result).toBeNull();
  });
});
