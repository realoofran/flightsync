import { describe, it, expect } from 'vitest';
import { parseFlightRadar24Url } from './flightRadar24.js';

describe('parseFlightRadar24Url', () => {
  it('parses a basic flight-number URL', () => {
    expect(parseFlightRadar24Url('https://www.flightradar24.com/data/flights/ua1608'))
      .toEqual({ flightCode: 'UA1608', airlineIcao: 'UAL' });
  });

  it('parses a live-flight URL with a hex id after a #', () => {
    expect(parseFlightRadar24Url('https://www.flightradar24.com/data/flights/vn18#2314b545'))
      .toEqual({ flightCode: 'VN18', airlineIcao: 'HVN' });
  });

  it('works across FR24 subdomains (data./free./mobile.)', () => {
    expect(parseFlightRadar24Url('https://data.flightradar24.com/data/flights/tk1980'))
      .toEqual({ flightCode: 'TK1980', airlineIcao: 'THY' });
    expect(parseFlightRadar24Url('https://free.flightradar24.com/data/flights/ac834'))
      .toEqual({ flightCode: 'AC834', airlineIcao: 'ACA' });
  });

  it('returns a null airlineIcao for an unrecognized airline prefix, but still returns the flight code', () => {
    expect(parseFlightRadar24Url('https://www.flightradar24.com/data/flights/zz9999'))
      .toEqual({ flightCode: 'ZZ9999', airlineIcao: null });
  });

  it('returns null for a non-FlightRadar24 URL (never silently treats an arbitrary site as valid)', () => {
    expect(parseFlightRadar24Url('https://www.flightaware.com/live/flight/UA1608')).toBeNull();
    expect(parseFlightRadar24Url('https://evil-flightradar24.com.attacker.net/data/flights/ua1608')).toBeNull();
  });

  it('returns null for garbage input instead of throwing', () => {
    expect(parseFlightRadar24Url('')).toBeNull();
    expect(parseFlightRadar24Url(null)).toBeNull();
    expect(parseFlightRadar24Url('not a url at all')).toBeNull();
    expect(parseFlightRadar24Url('https://www.flightradar24.com/')).toBeNull();
  });
});
