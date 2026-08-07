// src/lib/flagPatterns.js
//
// Vector flag "swatches" — NOT emoji. Confirmed on real hardware: the
// two-letter regional-indicator emoji sequence doesn't render as a colored
// flag glyph on this Windows/Electron config, it falls back to showing the
// two literal letters. That's a font/glyph problem no CSS sizing or masking
// can fix, since the intended glyph simply never exists. This draws actual
// small vector graphics instead — stripes/crosses in each country's real
// colors — so rendering is guaranteed regardless of font or emoji support.
//
// Deliberately simplified: exact emblems (crests, stars, crescents) are
// left out in favor of the dominant stripe/field pattern, since this is a
// small decorative watermark, not a reference graphic. Countries without an
// entry here simply render no swatch rather than a fabricated guess.

export const FLAG_PATTERNS = {
  // Europe
  DE: { type: 'horizontal', colors: ['#000000', '#DD0000', '#FFCE00'] },
  FR: { type: 'vertical', colors: ['#0055A4', '#FFFFFF', '#EF4135'] },
  IT: { type: 'vertical', colors: ['#009246', '#FFFFFF', '#CE2B37'] },
  ES: { type: 'horizontal', colors: ['#AA151B', '#F1BF00', '#AA151B'], weights: [1, 2, 1] },
  GB: { type: 'solid', bg: '#00247D' },
  NL: { type: 'horizontal', colors: ['#AE1C28', '#FFFFFF', '#21468B'] },
  BE: { type: 'vertical', colors: ['#000000', '#FAE042', '#ED2939'] },
  CH: { type: 'solid', bg: '#D52B1E' },
  AT: { type: 'horizontal', colors: ['#ED2939', '#FFFFFF', '#ED2939'] },
  PT: { type: 'vertical', colors: ['#046A38', '#DA291C'], weights: [2, 3] },
  IE: { type: 'vertical', colors: ['#169B62', '#FFFFFF', '#FF883E'] },
  PL: { type: 'horizontal', colors: ['#FFFFFF', '#DC143C'] },
  CZ: { type: 'horizontal', colors: ['#FFFFFF', '#D7141A'] },
  SK: { type: 'horizontal', colors: ['#FFFFFF', '#0B4EA2', '#EE1C25'] },
  HU: { type: 'horizontal', colors: ['#CD2A3E', '#FFFFFF', '#436F4D'] },
  RO: { type: 'vertical', colors: ['#002B7F', '#FCD116', '#CE1126'] },
  BG: { type: 'horizontal', colors: ['#FFFFFF', '#00966E', '#D62612'] },
  GR: { type: 'horizontal', colors: ['#0D5EAF', '#FFFFFF', '#0D5EAF', '#FFFFFF', '#0D5EAF'] },
  HR: { type: 'horizontal', colors: ['#FF0000', '#FFFFFF', '#171796'] },
  SI: { type: 'horizontal', colors: ['#FFFFFF', '#005CE6', '#EF3340'] },
  DK: { type: 'nordic-cross', bg: '#C60C30', cross: '#FFFFFF' },
  SE: { type: 'nordic-cross', bg: '#006AA7', cross: '#FECC02' },
  NO: { type: 'nordic-cross', bg: '#EF2B2D', cross: '#FFFFFF', crossInner: '#002868' },
  FI: { type: 'nordic-cross', bg: '#FFFFFF', cross: '#003580' },
  IS: { type: 'nordic-cross', bg: '#02529C', cross: '#FFFFFF', crossInner: '#DC1E35' },
  EE: { type: 'horizontal', colors: ['#0072CE', '#000000', '#FFFFFF'] },
  LV: { type: 'horizontal', colors: ['#9E3039', '#FFFFFF', '#9E3039'], weights: [2, 1, 2] },
  LT: { type: 'horizontal', colors: ['#FDB913', '#006A44', '#C1272D'] },
  UA: { type: 'horizontal', colors: ['#0057B7', '#FFD700'] },
  RU: { type: 'horizontal', colors: ['#FFFFFF', '#0039A6', '#D52B1E'] },
  TR: { type: 'solid', bg: '#E30A17' },

  // Middle East
  AE: { type: 'horizontal', colors: ['#00732F', '#FFFFFF', '#000000'] },
  QA: { type: 'solid', bg: '#8D1B3D' },
  SA: { type: 'solid', bg: '#006C35' },
  KW: { type: 'horizontal', colors: ['#007A3D', '#FFFFFF', '#CE1126'] },
  BH: { type: 'solid', bg: '#CE1126' },
  OM: { type: 'horizontal', colors: ['#FFFFFF', '#DB161B', '#008000'] },
  IL: { type: 'horizontal', colors: ['#0038B8', '#FFFFFF', '#0038B8'] },
  JO: { type: 'horizontal', colors: ['#000000', '#FFFFFF', '#007A3D'] },
  LB: { type: 'horizontal', colors: ['#EE161F', '#FFFFFF', '#EE161F'], weights: [1, 2, 1] },
  IQ: { type: 'horizontal', colors: ['#CE1126', '#FFFFFF', '#000000'] },
  IR: { type: 'horizontal', colors: ['#239F40', '#FFFFFF', '#DA0000'] },
  YE: { type: 'horizontal', colors: ['#CE1126', '#FFFFFF', '#000000'] },
  EG: { type: 'horizontal', colors: ['#CE1126', '#FFFFFF', '#000000'] },

  // Americas
  US: { type: 'horizontal', colors: ['#B22234', '#FFFFFF', '#B22234', '#FFFFFF', '#B22234', '#FFFFFF', '#B22234'] },
  CA: { type: 'vertical', colors: ['#FF0000', '#FFFFFF', '#FF0000'] },
  MX: { type: 'vertical', colors: ['#006847', '#FFFFFF', '#CE1126'] },
  BR: { type: 'solid', bg: '#009739' },
  AR: { type: 'horizontal', colors: ['#74ACDF', '#FFFFFF', '#74ACDF'] },
  CL: { type: 'horizontal', colors: ['#FFFFFF', '#D52B1E'] },
  CO: { type: 'horizontal', colors: ['#FCD116', '#003893', '#CE1126'], weights: [2, 1, 1] },
  PE: { type: 'vertical', colors: ['#D91023', '#FFFFFF', '#D91023'] },
  VE: { type: 'horizontal', colors: ['#FFCC00', '#00247D', '#CF142B'] },

  // Asia-Pacific — Japan and Korea both have a white field, which used to
  // be represented here as a flat 'solid' white rect: on a light-themed
  // glass panel that renders as an indistinguishable blank box (and
  // identical to each other). Both actually get their defining emblem
  // drawn instead.
  JP: { type: 'disc', bg: '#FFFFFF', disc: '#BC002D' },
  KR: { type: 'disc-split', bg: '#FFFFFF', discLeft: '#C60C30', discRight: '#003478' },
  CN: { type: 'solid', bg: '#DE2910' },
  TW: { type: 'solid', bg: '#FE0000' },
  HK: { type: 'solid', bg: '#DE2910' },
  SG: { type: 'horizontal', colors: ['#ED2939', '#FFFFFF'] },
  TH: { type: 'horizontal', colors: ['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], weights: [1, 1, 2, 1, 1] },
  MY: { type: 'horizontal', colors: ['#CC0001', '#FFFFFF'] },
  ID: { type: 'horizontal', colors: ['#FF0000', '#FFFFFF'] },
  PH: { type: 'horizontal', colors: ['#0038A8', '#CE1126'] },
  VN: { type: 'solid', bg: '#DA251D' },
  IN: { type: 'horizontal', colors: ['#FF9933', '#FFFFFF', '#138808'] },
  AU: { type: 'solid', bg: '#00247D' },
  NZ: { type: 'solid', bg: '#00247D' },

  // Africa
  ZA: { type: 'horizontal', colors: ['#E03C31', '#FFFFFF', '#001489', '#FFFFFF', '#007A4D'] },
  MA: { type: 'solid', bg: '#C1272D' },
  KE: { type: 'horizontal', colors: ['#000000', '#FFFFFF', '#BB0000', '#FFFFFF', '#006600'] },
  ET: { type: 'horizontal', colors: ['#078930', '#FCDD09', '#DA121A'] },
  NG: { type: 'vertical', colors: ['#008751', '#FFFFFF', '#008751'] },
};

export function flagPatternForIso2(iso2) {
  return iso2 ? FLAG_PATTERNS[iso2.toUpperCase()] ?? null : null;
}
