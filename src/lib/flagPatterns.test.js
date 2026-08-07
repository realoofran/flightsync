import { describe, it, expect } from 'vitest';
import { FLAG_PATTERNS, flagPatternForIso2 } from './flagPatterns.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('flagPatternForIso2', () => {
  it('resolves case-insensitively', () => {
    expect(flagPatternForIso2('tr')).toBe(FLAG_PATTERNS.TR);
    expect(flagPatternForIso2('TR')).toBe(FLAG_PATTERNS.TR);
  });

  it('returns null for an unknown or missing code', () => {
    expect(flagPatternForIso2('ZZ')).toBeNull();
    expect(flagPatternForIso2(null)).toBeNull();
    expect(flagPatternForIso2(undefined)).toBeNull();
  });
});

describe('FLAG_PATTERNS schema', () => {
  for (const [iso2, pattern] of Object.entries(FLAG_PATTERNS)) {
    it(`${iso2} has a valid, renderable pattern`, () => {
      expect(['solid', 'horizontal', 'vertical', 'nordic-cross', 'disc', 'disc-split']).toContain(pattern.type);

      if (pattern.type === 'solid') {
        expect(pattern.bg).toMatch(HEX);
      }
      if (pattern.type === 'horizontal' || pattern.type === 'vertical') {
        expect(pattern.colors.length).toBeGreaterThanOrEqual(2);
        for (const c of pattern.colors) expect(c).toMatch(HEX);
        if (pattern.weights) expect(pattern.weights.length).toBe(pattern.colors.length);
      }
      if (pattern.type === 'nordic-cross') {
        expect(pattern.bg).toMatch(HEX);
        expect(pattern.cross).toMatch(HEX);
      }
      if (pattern.type === 'disc') {
        expect(pattern.bg).toMatch(HEX);
        expect(pattern.disc).toMatch(HEX);
      }
      if (pattern.type === 'disc-split') {
        expect(pattern.bg).toMatch(HEX);
        expect(pattern.discLeft).toMatch(HEX);
        expect(pattern.discRight).toMatch(HEX);
      }
    });
  }
});

describe('Japan / Korea (regression: used to both be flat solid white)', () => {
  // A flat white rect is indistinguishable from an empty/missing swatch, and
  // JP and KR rendered as the exact same box — the fix gives each its actual
  // defining emblem instead of just the shared white field color.
  it('Japan renders its emblem, not a flat solid field', () => {
    expect(FLAG_PATTERNS.JP.type).not.toBe('solid');
    expect(FLAG_PATTERNS.JP.type).toBe('disc');
  });

  it('Korea renders its emblem, not a flat solid field', () => {
    expect(FLAG_PATTERNS.KR.type).not.toBe('solid');
    expect(FLAG_PATTERNS.KR.type).toBe('disc-split');
  });

  it('Japan and Korea are no longer visually identical', () => {
    expect(FLAG_PATTERNS.JP).not.toEqual(FLAG_PATTERNS.KR);
  });
});
