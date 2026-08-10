import { describe, it, expect } from 'vitest';
import { buildAddonCsv } from './csvExport.js';

function addon(overrides) {
  return {
    title: 'Test Addon',
    folderName: 'test-addon',
    contentType: 'SCENERY',
    region: 'Europe',
    matchedIcao: 'EDDM',
    matchedAircraftType: null,
    matchedAirline: null,
    confirmed: true,
    alwaysActive: false,
    ...overrides,
  };
}

describe('buildAddonCsv', () => {
  it('produces a header row plus one row per addon, CRLF-terminated', () => {
    const csv = buildAddonCsv([addon()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Title,Folder Name,Content Type,Region,Matched ICAO,Matched Aircraft Type,Matched Airline,Confirmed,Always Active');
    expect(lines[1]).toBe('Test Addon,test-addon,SCENERY,Europe,EDDM,,,Yes,No');
    expect(lines[2]).toBe(''); // trailing CRLF after the last row
  });

  it('sorts rows alphabetically by title regardless of input order', () => {
    const csv = buildAddonCsv([addon({ title: 'Zebra' }), addon({ title: 'Alpha' })]);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toMatch(/^Alpha,/);
    expect(lines[2]).toMatch(/^Zebra,/);
  });

  it('quotes and escapes a title containing a comma', () => {
    const csv = buildAddonCsv([addon({ title: 'Munich, Franz Josef Strauss' })]);
    expect(csv).toContain('"Munich, Franz Josef Strauss"');
  });

  it('quotes and doubles internal quotes in a title', () => {
    const csv = buildAddonCsv([addon({ title: 'The "Best" Scenery' })]);
    expect(csv).toContain('"The ""Best"" Scenery"');
  });

  it('renders null/undefined optional fields as empty, not the literal word null', () => {
    const csv = buildAddonCsv([addon({ region: null, matchedIcao: null })]);
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('renders confirmed/alwaysActive as Yes/No, not true/false', () => {
    const csv = buildAddonCsv([addon({ confirmed: false, alwaysActive: true })]);
    expect(csv).toContain(',No,Yes\r\n');
  });

  it('produces just a header line for an empty library', () => {
    const csv = buildAddonCsv([]);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });

  it('never throws on missing/undefined input', () => {
    expect(() => buildAddonCsv(undefined)).not.toThrow();
    expect(() => buildAddonCsv(null)).not.toThrow();
  });
});
