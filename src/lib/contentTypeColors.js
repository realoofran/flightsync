// src/lib/contentTypeColors.js
//
// One color per addon content type, used consistently everywhere an addon
// is shown — the left border on manifest rows, the type tag, the library
// category legend. Keeping this in one place means the legend can never
// drift out of sync with the actual row colors.

export const CONTENT_TYPE_COLORS = {
  SCENERY: { var: '--type-scenery', hex: '#4FD8FF', label: 'Scenery' },
  LIVERY: { var: '--type-livery', hex: '#FFB000', label: 'Livery' },
  AIRCRAFT: { var: '--type-aircraft', hex: '#00E5A0', label: 'Aircraft' },
  OTHER: { var: '--type-other', hex: '#B98CFF', label: 'Other' },
};

export function colorFor(contentType) {
  return CONTENT_TYPE_COLORS[contentType] ?? CONTENT_TYPE_COLORS.OTHER;
}

// Prefer this over reading .hex directly wherever the value goes into a
// style/color prop — resolves through the CSS custom property (which the
// active theme may override, e.g. the light theme's darkened text-safe
// variants) instead of hardcoding the dark-theme-tuned literal.
export function cssColor(contentType) {
  return `var(${colorFor(contentType).var})`;
}
