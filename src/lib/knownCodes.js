// src/lib/knownCodes.js
//
// Renderer-side copies of the code lists used for datalist autocomplete on
// the manual confirm form. Intentionally duplicated rather than imported
// from electron/lib/addonScanner.js — the renderer can't reach into the
// main-process file tree, and these lists are small enough that keeping
// them in sync by hand is fine for now.
//
// TODO: if these grow much, move both to a shared electron/renderer-neutral
// module and have Vite alias it in, rather than hand-syncing two copies.

export const KNOWN_AIRCRAFT_TYPES = [
  'A21N', 'A20N', 'A339', 'A359', 'B738', 'B77W', 'B789', 'DR40',
];

export const KNOWN_AIRLINES = [
  'THY', 'PGT', 'DLH', 'CFG', 'UAE', 'QTR', 'BAW', 'AFR', 'UAL', 'DAL',
];
