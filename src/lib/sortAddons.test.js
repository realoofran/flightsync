import { describe, it, expect } from 'vitest';
import { sortAddons } from './sortAddons.js';

const addons = [
  { id: 'b', title: 'Bravo Airport', contentType: 'SCENERY' },
  { id: 'a', title: 'Alpha Jet', contentType: 'AIRCRAFT' },
  { id: 'c', title: 'Charlie Livery', contentType: 'LIVERY' },
];

describe('sortAddons', () => {
  it('returns the same order for "default" (no sort applied)', () => {
    expect(sortAddons(addons, 'default', null).map(a => a.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by name A-Z', () => {
    expect(sortAddons(addons, 'name', null).map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by content type, then name within a type', () => {
    expect(sortAddons(addons, 'type', null).map(a => a.id)).toEqual(['a', 'c', 'b']); // AIRCRAFT, LIVERY, SCENERY
  });

  it('sorts by size descending when sizes are provided', () => {
    const sizes = { a: 100, b: 300, c: 200 };
    expect(sortAddons(addons, 'size', sizes).map(a => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to input order for "size" when sizes have not been measured yet', () => {
    expect(sortAddons(addons, 'size', null)).toEqual(addons);
  });

  it('never mutates the input array', () => {
    const copy = [...addons];
    sortAddons(addons, 'name', null);
    expect(addons).toEqual(copy);
  });
});
