import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression test for the Task 3 contrast fixes: the dark-mode-tuned accent
// colors (amber #FFB000, green #00E5A0, etc.) measured as low as ~1.5:1
// against the light theme's background when used as text — this asserts
// the light theme's -text variants stay above WCAG AA (4.5:1) so nobody
// reintroduces the bug by hand-editing a hex value in tokens.css.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(__dirname, '..', 'styles', 'tokens.css');
const tokensCss = fs.readFileSync(tokensPath, 'utf-8');

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16));
}
function luminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrast(hex1, hex2) {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function extractVar(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`--${name} not found (or not a plain hex value) in tokens.css`);
  return match[1];
}

// Pull just the { ... } body of the main theme-override rule (there are
// several other one-off `[data-theme='light'] .foo { ... }` rules earlier
// in the file — e.g. the grain-opacity tweak — that a plain string split
// would incorrectly land on instead).
function extractThemeBlock(css, selector) {
  const match = css.match(new RegExp(`\\[data-theme='${selector}'\\]\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Theme block for "${selector}" not found in tokens.css`);
  return match[1];
}

const lightBlock = extractThemeBlock(tokensCss, 'light');
const LIGHT_BG = extractVar(lightBlock, 'bg');

describe('light theme text-color contrast (WCAG AA >= 4.5:1)', () => {
  const AA = 4.5;
  for (const name of ['amber-text', 'green-text', 'cyan-text', 'purple-text', 'red-text', 'text-faint']) {
    it(`--${name} passes AA against the light background`, () => {
      const fg = extractVar(lightBlock, name);
      const ratio = contrast(fg, LIGHT_BG);
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe('high-contrast theme (WCAG AAA >= 7:1 against pure black)', () => {
  const hcBlock = extractThemeBlock(tokensCss, 'high-contrast');
  const AAA = 7;
  for (const name of ['text', 'text-muted', 'text-faint']) {
    it(`--${name} passes AAA against pure black`, () => {
      const fg = extractVar(hcBlock, name);
      const ratio = contrast(fg, '#000000');
      expect(ratio).toBeGreaterThanOrEqual(AAA);
    });
  }
});
