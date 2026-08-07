import { flagPatternForIso2 } from '../lib/flagPatterns.js';

/**
 * Draws a small vector flag as real SVG shapes — deliberately not an emoji.
 * Confirmed on real hardware that the two-letter regional-indicator emoji
 * sequence doesn't render as a colored flag glyph in this app's Electron/
 * Windows configuration; it falls back to showing the two literal letters,
 * no matter how the surrounding CSS is sized or masked, because the
 * intended glyph never exists in the first place. Drawing actual shapes
 * sidesteps the whole font/glyph problem.
 */
export default function FlagSwatch({ iso2, width = 48, height = 32, rounded = 4, className = '' }) {
  const pattern = flagPatternForIso2(iso2);
  if (!pattern) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 32"
      className={`flag-swatch ${className}`}
      aria-hidden="true"
    >
      <clipPath id={`flag-clip-${iso2}`}>
        <rect width="48" height="32" rx={rounded} />
      </clipPath>
      <g clipPath={`url(#flag-clip-${iso2})`}>
        {renderPattern(pattern)}
      </g>
      <rect width="48" height="32" rx={rounded} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}

function renderPattern(pattern) {
  const { type } = pattern;

  if (type === 'solid') {
    return <rect width="48" height="32" fill={pattern.bg} />;
  }

  if (type === 'horizontal') {
    const { colors, weights } = pattern;
    const totalWeight = weights ? weights.reduce((a, b) => a + b, 0) : colors.length;
    let y = 0;
    return colors.map((c, i) => {
      const w = weights ? weights[i] : 1;
      const h = (32 * w) / totalWeight;
      const rect = <rect key={i} x="0" y={y} width="48" height={h} fill={c} />;
      y += h;
      return rect;
    });
  }

  if (type === 'vertical') {
    const { colors, weights } = pattern;
    const totalWeight = weights ? weights.reduce((a, b) => a + b, 0) : colors.length;
    let x = 0;
    return colors.map((c, i) => {
      const w = weights ? weights[i] : 1;
      const wd = (48 * w) / totalWeight;
      const rect = <rect key={i} x={x} y="0" width={wd} height="32" fill={c} />;
      x += wd;
      return rect;
    });
  }

  if (type === 'disc') {
    // Centered circle on a field (e.g. Japan's Hinomaru) — a flat "solid"
    // rect can't represent this, and reusing "solid" with just the field
    // color (as this used to) renders as a blank box indistinguishable
    // from any other white-field flag or from no flag at all.
    return (
      <>
        <rect width="48" height="32" fill={pattern.bg} />
        <circle cx="24" cy="16" r={pattern.r ?? 9} fill={pattern.disc} />
      </>
    );
  }

  if (type === 'disc-split') {
    // Circle split left/right into two colors (approximates the red/blue
    // taegeuk on South Korea's flag — the real emblem is a diagonal S-curve,
    // simplified here to a straight split, per this file's stated
    // philosophy of dominant-pattern swatches over reference graphics).
    const r = pattern.r ?? 9;
    return (
      <>
        <rect width="48" height="32" fill={pattern.bg} />
        <path d={`M 24 ${16 - r} A ${r} ${r} 0 0 1 24 ${16 + r} Z`} fill={pattern.discRight} />
        <path d={`M 24 ${16 - r} A ${r} ${r} 0 0 0 24 ${16 + r} Z`} fill={pattern.discLeft} />
      </>
    );
  }

  if (type === 'nordic-cross') {
    // Offset cross (Scandinavian flag layout): vertical bar sits left of
    // center, horizontal bar through the middle.
    const barX = 16;
    const barW = 6;
    const barY = 13;
    const barH = 6;
    return (
      <>
        <rect width="48" height="32" fill={pattern.bg} />
        <rect x={barX} y="0" width={barW} height="32" fill={pattern.cross} />
        <rect x="0" y={barY} width="48" height={barH} fill={pattern.cross} />
        {pattern.crossInner && (
          <>
            <rect x={barX + 1.5} y="0" width={barW - 3} height="32" fill={pattern.crossInner} />
            <rect x="0" y={barY + 1.5} width="48" height={barH - 3} fill={pattern.crossInner} />
          </>
        )}
      </>
    );
  }

  return null;
}
