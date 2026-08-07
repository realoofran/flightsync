// electron/lib/contentTypes.js
//
// The one canonical addon content-type enum, shared by the heuristic scanner
// (addonScanner.js) and the AI classification fallback (aiClassifier.js) so
// neither can drift from the other or from the renderer's copy in
// src/lib/contentTypeColors.js.

export const CONTENT_TYPES = ['SCENERY', 'LIVERY', 'AIRCRAFT', 'OTHER'];

export function isValidContentType(value) {
  return CONTENT_TYPES.includes(value);
}
