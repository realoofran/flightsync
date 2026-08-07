import { describe, it, expect } from 'vitest';
import { lonToPx, latToPx, pickZoomToFit, tilesForViewport, TILE_SIZE } from './mercator.js';

describe('lonToPx / latToPx', () => {
  it('maps the world edges to 0 and the full world width at zoom 0', () => {
    expect(lonToPx(-180, 0)).toBeCloseTo(0, 5);
    expect(lonToPx(180, 0)).toBeCloseTo(TILE_SIZE, 5);
  });

  it('maps the equator to the vertical center at any zoom', () => {
    expect(latToPx(0, 4)).toBeCloseTo((Math.pow(2, 4) * TILE_SIZE) / 2, 5);
  });
});

describe('pickZoomToFit', () => {
  it('returns maxZoom for a single point (zero-size bounding box always fits)', () => {
    const zoom = pickZoomToFit([{ lat: 48.35, lon: 11.79 }], 800, 420, { minZoom: 2, maxZoom: 12 });
    expect(zoom).toBe(12);
  });

  it('picks a lower zoom for points spanning a wide area than for nearby points', () => {
    const near = pickZoomToFit(
      [{ lat: 48.35, lon: 11.79 }, { lat: 48.36, lon: 11.80 }],
      800, 420, { minZoom: 2, maxZoom: 12 },
    );
    const far = pickZoomToFit(
      [{ lat: 48.35, lon: 11.79 }, { lat: -33.87, lon: 151.21 }], // Munich <-> Sydney
      800, 420, { minZoom: 2, maxZoom: 12 },
    );
    expect(far).toBeLessThan(near);
  });

  it('never returns a zoom outside [minZoom, maxZoom]', () => {
    const zoom = pickZoomToFit(
      [{ lat: 89, lon: -179 }, { lat: -89, lon: 179 }],
      800, 420, { minZoom: 2, maxZoom: 12 },
    );
    expect(zoom).toBeGreaterThanOrEqual(2);
    expect(zoom).toBeLessThanOrEqual(12);
  });
});

describe('tilesForViewport', () => {
  it('covers the full viewport with at least one tile margin on each side', () => {
    const tiles = tilesForViewport(0, 0, 512, 512, 2);
    // At zoom 2 the world is 4x4 tiles (1024x1024px); a 512x512 viewport
    // starting at the origin needs 2 tiles + margin in each direction.
    const xs = tiles.map(t => t.x);
    const ys = tiles.map(t => t.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0); // clamped, no negative y (no polar wrap)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(1);
  });

  it('clamps tile y to the valid [0, worldTiles-1] range (no polar wraparound)', () => {
    const tiles = tilesForViewport(-10000, -10000, 256, 256, 2);
    expect(tiles.every(t => t.y >= 0)).toBe(true);
  });
});
