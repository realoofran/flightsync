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
  'A21N', 'A20N', 'A319', 'A320', 'A321', 'A339', 'A332', 'A359', 'A388',
  'B38M', 'B738', 'B739', 'B744', 'B752', 'B763', 'B772', 'B77W', 'B788',
  'B789', 'CRJ9', 'E190', 'E175', 'DR40', 'C172', 'PA28', 'TBM9',
  'A318', 'A333', 'B748', 'B78X', 'CRJ7', 'CRJ2', 'E170', 'E145', 'AT76',
  'AT72', 'DH8D', 'B350', 'BE20', 'C208', 'C152', 'C182', 'SR22', 'SR20',
  'DA62', 'DA42', 'DA40', 'PC12', 'TBM8',
];

export const KNOWN_AIRLINES = [
  'THY', 'PGT', 'DLH', 'CFG', 'UAE', 'QTR', 'BAW', 'AFR', 'UAL', 'DAL',
  'RYR', 'EZY', 'KLM', 'IBE', 'SWR', 'AUA', 'WZZ', 'VLG', 'NAX', 'SAS',
  'FIN', 'AFL', 'AAL', 'SWA', 'JBU', 'ASA', 'ACA', 'CPA', 'ANA', 'JAL',
  'SIA', 'QFA', 'ETD', 'SVA',
  'LOT', 'TAP', 'ICE', 'AEE', 'CTN', 'TRA', 'BTI', 'RAM', 'SAA', 'KQA',
  'ETH', 'ELY', 'VIR', 'VOZ', 'LAN', 'AVA', 'CMP', 'AMX', 'WJA', 'HAL',
  'FFT', 'NKS', 'AAY', 'SCX', 'VOI', 'HVN', 'THA', 'CSN', 'CES', 'CCA',
  'CHH', 'KAL', 'AAR', 'EVA', 'CAL', 'PAL', 'GIA', 'AXM', 'MAS', 'AIC',
  'IGO',
];
