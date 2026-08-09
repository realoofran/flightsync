import { describe, it, expect } from 'vitest';
import { distanceForRoute } from './greatCircle.js';

// Real coordinates, real expected distances — cross-checked against the
// actual bundled dataset, not invented numbers.
const airportCoords = {
  LTFM: [41.2749, 28.7321], // Istanbul
  EDDM: [48.3538, 11.7861], // Munich
  KJFK: [40.6394, -73.7793], // New York JFK
  EGLL: [51.4707, -0.4599], // London Heathrow
};

describe('distanceForRoute', () => {
  it('computes a known real-world great-circle distance (Istanbul -> Munich)', () => {
    expect(distanceForRoute('LTFM', 'EDDM', airportCoords)).toBe(835);
  });

  it('computes a known real-world great-circle distance (JFK -> Heathrow)', () => {
    expect(distanceForRoute('KJFK', 'EGLL', airportCoords)).toBe(2991);
  });

  it('is symmetric regardless of direction', () => {
    expect(distanceForRoute('LTFM', 'EDDM', airportCoords)).toBe(distanceForRoute('EDDM', 'LTFM', airportCoords));
  });

  it('is case-insensitive on the ICAO codes', () => {
    expect(distanceForRoute('ltfm', 'eddm', airportCoords)).toBe(835);
  });

  it('returns null when either airport is not in the dataset, rather than guessing', () => {
    expect(distanceForRoute('LTFM', 'ZZZZ', airportCoords)).toBeNull();
    expect(distanceForRoute('ZZZZ', 'EDDM', airportCoords)).toBeNull();
  });

  it('returns null for missing/undefined input instead of throwing', () => {
    expect(distanceForRoute(null, 'EDDM', airportCoords)).toBeNull();
    expect(distanceForRoute(undefined, undefined, airportCoords)).toBeNull();
  });
});
