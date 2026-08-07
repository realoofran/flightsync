// src/lib/countryFlags.js
//
// Resolves a flag for the current flight — prefers the operating airline's
// home country, falls back to the origin airport's ICAO-prefix country for
// GA/private/glider flights with no airline code. Uses native emoji flags
// (built from Unicode regional indicator symbols) rather than image assets —
// renders natively with zero network dependency and zero bundled image
// weight. Windows 11 renders these properly via Segoe UI Emoji; older
// Windows may show the two-letter code instead, a platform font limitation.

const AIRLINE_COUNTRY = {
  // Turkey
  THY: 'TR', PGT: 'TR', KKK: 'TR', OHY: 'TR',
  // Germany / Austria / Switzerland
  DLH: 'DE', CFG: 'DE', GEC: 'DE', BER: 'DE', EWG: 'DE',
  AUA: 'AT', SWR: 'CH', EDW: 'CH',
  // UK / Ireland
  BAW: 'GB', EZY: 'GB', VIR: 'GB', TOM: 'GB', SHT: 'GB', BEE: 'GB',
  RYR: 'IE', EIN: 'IE',
  // France / Benelux
  AFR: 'FR', TVF: 'FR', KLM: 'NL', TFL: 'NL', BEL: 'BE',
  // Iberia
  IBE: 'ES', VLG: 'ES', AEA: 'ES', TAP: 'PT',
  // Italy / Malta
  ITY: 'IT', AZA: 'IT', NOS: 'IT', AMU: 'MT',
  // Nordics
  SAS: 'SE', NAX: 'NO', DNY: 'NO', FIN: 'FI', ICE: 'IS',
  // Eastern Europe
  WZZ: 'HU', LOT: 'PL', ROT: 'RO', CSA: 'CZ', TAR: 'TN',
  // Middle East
  UAE: 'AE', ETD: 'AE', FDB: 'AE', QTR: 'QA', SVA: 'SA', GFA: 'BH',
  MSR: 'EG', RJA: 'JO', MEA: 'LB', ELY: 'IL', KAC: 'KW', OMA: 'OM',
  // Americas
  UAL: 'US', DAL: 'US', AAL: 'US', SWA: 'US', JBU: 'US', ASA: 'US',
  FFT: 'US', NKS: 'US', ACA: 'CA', WJA: 'CA', AMX: 'MX', VOI: 'MX',
  AVA: 'CO', LAN: 'CL', ARG: 'AR', TAM: 'BR', GLO: 'BR',
  // Asia-Pacific
  CPA: 'HK', ANA: 'JP', JAL: 'JP', SIA: 'SG', QFA: 'AU', JST: 'AU',
  VOZ: 'AU', ANZ: 'NZ', THA: 'TH', MAS: 'MY', GIA: 'ID', PAL: 'PH',
  CEB: 'PH', CCA: 'CN', CES: 'CN', CSN: 'CN', KAL: 'KR',
  AAR: 'KR', EVA: 'TW', CAL: 'TW', VJC: 'VN', HVN: 'VN', IGO: 'IN',
  AIC: 'IN',
  // Africa
  ETH: 'ET', SAA: 'ZA', KQA: 'KE', RAM: 'MA',
};

// ICAO location-indicator prefixes -> ISO 3166-1 alpha-2 country, per the
// public ICAO Annex 7 allocation scheme. Sorted longest-prefix-first at
// lookup time so e.g. "LT" (Turkey) is checked before a hypothetical
// single-letter "L" entry would ever shadow it.
const AIRPORT_PREFIX_COUNTRY = [
  // North America
  ['K', 'US'], ['PA', 'US'], ['PF', 'US'], ['PH', 'US'], ['PG', 'US'],
  ['C', 'CA'],
  ['MM', 'MX'],
  // Central America / Caribbean
  ['MG', 'GT'], ['MH', 'HN'], ['MN', 'NI'], ['MP', 'PA'], ['MR', 'CR'],
  ['MS', 'SV'], ['MB', 'TC'], ['MD', 'DO'], ['MK', 'JM'], ['MU', 'CU'],
  ['MW', 'KY'], ['MY', 'BS'], ['MZ', 'BZ'], ['MT', 'HT'],
  ['TA', 'AG'], ['TB', 'BB'], ['TD', 'DM'], ['TG', 'GD'], ['TI', 'US'],
  ['TJ', 'US'], ['TK', 'KN'], ['TL', 'LC'], ['TT', 'TT'], ['TV', 'VC'],
  ['TX', 'BM'],
  // South America
  ['SA', 'AR'], ['SB', 'BR'], ['SD', 'BR'], ['SI', 'BR'], ['SJ', 'BR'],
  ['SN', 'BR'], ['SS', 'BR'], ['SW', 'BR'], ['SC', 'CL'], ['SE', 'EC'],
  ['SG', 'PY'], ['SK', 'CO'], ['SL', 'BO'], ['SM', 'SR'], ['SO', 'GF'],
  ['SP', 'PE'], ['SU', 'UY'], ['SV', 'VE'], ['SY', 'GY'], ['SF', 'FK'],
  // Northern / Western Europe
  ['EB', 'BE'], ['ED', 'DE'], ['ET', 'DE'], ['EE', 'EE'], ['EF', 'FI'],
  ['EG', 'GB'], ['EI', 'IE'], ['EH', 'NL'], ['EK', 'DK'], ['EL', 'LU'],
  ['EN', 'NO'], ['EP', 'PL'], ['ES', 'SE'], ['EV', 'LV'], ['EY', 'LT'],
  // Southern Europe / Mediterranean
  ['LA', 'AL'], ['LB', 'BG'], ['LC', 'CY'], ['LD', 'HR'], ['LE', 'ES'],
  ['LF', 'FR'], ['LG', 'GR'], ['LH', 'HU'], ['LI', 'IT'], ['LJ', 'SI'],
  ['LK', 'CZ'], ['LL', 'IL'], ['LM', 'MT'], ['LN', 'MC'], ['LO', 'AT'],
  ['LP', 'PT'], ['LQ', 'BA'], ['LR', 'RO'], ['LS', 'CH'], ['LT', 'TR'],
  ['LU', 'MD'], ['LW', 'MK'], ['LX', 'GI'], ['LY', 'RS'], ['LZ', 'SK'],
  // Russia / former USSR
  ['UA', 'KZ'], ['UB', 'AZ'], ['UD', 'AM'], ['UG', 'GE'], ['UK', 'UA'],
  ['UM', 'BY'], ['UT', 'UZ'], ['U', 'RU'],
  // Middle East / South Asia
  ['OA', 'AF'], ['OB', 'BH'], ['OE', 'SA'], ['OI', 'IR'], ['OJ', 'JO'],
  ['OK', 'KW'], ['OL', 'LB'], ['OM', 'AE'], ['OO', 'OM'], ['OP', 'PK'],
  ['OR', 'IQ'], ['OS', 'SY'], ['OT', 'QA'], ['OY', 'YE'], ['HE', 'EG'],
  // South / Southeast Asia
  ['VA', 'IN'], ['VE', 'IN'], ['VI', 'IN'], ['VO', 'IN'], ['VC', 'LK'],
  ['VD', 'KH'], ['VG', 'BD'], ['VH', 'HK'], ['VL', 'LA'], ['VM', 'MO'],
  ['VN', 'NP'], ['VQ', 'BT'], ['VR', 'MV'], ['VT', 'TH'], ['VV', 'VN'],
  ['VY', 'MM'], ['WA', 'ID'], ['WI', 'ID'], ['WQ', 'ID'], ['WR', 'ID'],
  ['WB', 'MY'], ['WM', 'MY'], ['WP', 'TL'], ['WS', 'SG'],
  // East Asia / Pacific
  ['RC', 'TW'], ['RJ', 'JP'], ['RO', 'JP'], ['RK', 'KR'], ['RP', 'PH'],
  ['ZK', 'KP'], ['ZM', 'MN'], ['ZB', 'CN'], ['ZG', 'CN'], ['ZH', 'CN'],
  ['ZJ', 'CN'], ['ZL', 'CN'], ['ZP', 'CN'], ['ZS', 'CN'], ['ZU', 'CN'],
  ['ZW', 'CN'], ['ZY', 'CN'],
  // Africa
  ['HA', 'ET'], ['HB', 'BI'], ['HC', 'SO'], ['HD', 'DJ'], ['HH', 'ER'],
  ['HK', 'KE'], ['HL', 'LY'], ['HR', 'RW'], ['HS', 'SD'], ['HT', 'TZ'],
  ['HU', 'UG'], ['DA', 'DZ'], ['DB', 'BJ'], ['DF', 'BF'], ['DG', 'GH'],
  ['DI', 'CI'], ['DN', 'NG'], ['DR', 'NE'], ['DT', 'TN'], ['DX', 'TG'],
  ['GA', 'ML'], ['GB', 'GM'], ['GC', 'ES'], ['GE', 'ES'], ['GF', 'SL'],
  ['GG', 'GW'], ['GL', 'LR'], ['GM', 'MA'], ['GO', 'SN'], ['GQ', 'MR'],
  ['GU', 'GN'], ['GV', 'CV'], ['FA', 'ZA'], ['FB', 'BW'], ['FC', 'CG'],
  ['FD', 'SZ'], ['FE', 'CF'], ['FG', 'GQ'], ['FH', 'SH'], ['FI', 'MU'],
  ['FK', 'CM'], ['FL', 'ZM'], ['FM', 'MG'], ['FN', 'AO'], ['FO', 'GA'],
  ['FP', 'ST'], ['FQ', 'MZ'], ['FS', 'SC'], ['FT', 'TD'], ['FV', 'ZW'],
  ['FW', 'MW'], ['FY', 'NA'], ['FZ', 'CD'],
  // Oceania
  ['NF', 'FJ'], ['NG', 'KI'], ['NI', 'NU'], ['NL', 'WF'], ['NS', 'WS'],
  ['NT', 'PF'], ['NV', 'VU'], ['NW', 'NC'], ['NZ', 'NZ'], ['AG', 'SB'],
  ['AN', 'NR'], ['AY', 'PG'], ['Y', 'AU'],
];

/**
 * Returns an ISO 3166-1 alpha-2 country code (e.g. "TR"), not an emoji —
 * rendering is the caller's job. See FlagSwatch.jsx: this app draws actual
 * small vector flags rather than relying on emoji flag glyphs, which were
 * confirmed not to render as colored flags on at least one real Windows/
 * Electron configuration (falls back to showing the two literal letters).
 */
export function countryForFlight(plan) {
  if (!plan) return null;
  if (plan.airlineIcao && AIRLINE_COUNTRY[plan.airlineIcao]) {
    return AIRLINE_COUNTRY[plan.airlineIcao];
  }
  return countryForIcao(plan.origin);
}

export function countryForIcao(icao) {
  if (!icao) return null;
  const match = AIRPORT_PREFIX_COUNTRY
    .slice()
    .sort((a, b) => b[0].length - a[0].length)
    .find(([prefix]) => icao.startsWith(prefix));
  return match ? match[1] : null;
}
