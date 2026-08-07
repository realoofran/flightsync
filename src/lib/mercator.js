// src/lib/mercator.js
//
// Web Mercator / slippy-map tile math shared by any component that draws
// real OpenStreetMap tiles with points projected on top (RouteMap.jsx,
// SceneryMap.jsx). Pure functions only — no DOM, easily unit-tested.

export const TILE_SIZE = 256;

export function osmTileUrl(z, x, y) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function lonToPx(lon, zoom) {
  return ((lon + 180) / 360) * Math.pow(2, zoom) * TILE_SIZE;
}

export function latToPx(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom) * TILE_SIZE;
}

/**
 * Highest zoom (most detail) at which every point still fits inside
 * viewportW/viewportH (times fitFraction, leaving a margin).
 */
export function pickZoomToFit(points, viewportW, viewportH, { minZoom, maxZoom, fitFraction = 0.8 } = {}) {
  const lats = points.map(p => p.lat);
  const lons = points.map(p => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

  let zoom = maxZoom;
  for (let z = maxZoom; z >= minZoom; z--) {
    const w = lonToPx(lonMax, z) - lonToPx(lonMin, z);
    const h = latToPx(latMin, z) - latToPx(latMax, z);
    if (w <= viewportW * fitFraction && h <= viewportH * fitFraction) { zoom = z; break; }
    zoom = z;
  }
  return zoom;
}

/** Tiles needed to cover a viewport of the given size at (offsetX, offsetY), with a 1-tile margin. */
export function tilesForViewport(offsetX, offsetY, viewportW, viewportH, zoom) {
  const worldTiles = Math.pow(2, zoom);
  const tileXStart = Math.floor(offsetX / TILE_SIZE) - 1;
  const tileXEnd = Math.floor((offsetX + viewportW) / TILE_SIZE) + 1;
  const tileYStart = Math.max(0, Math.floor(offsetY / TILE_SIZE) - 1);
  const tileYEnd = Math.min(worldTiles - 1, Math.floor((offsetY + viewportH) / TILE_SIZE) + 1);

  const tiles = [];
  for (let tx = tileXStart; tx <= tileXEnd; tx++) {
    for (let ty = tileYStart; ty <= tileYEnd; ty++) {
      tiles.push({
        z: zoom, x: tx, y: ty, wrap: worldTiles,
        px: tx * TILE_SIZE - offsetX,
        py: ty * TILE_SIZE - offsetY,
      });
    }
  }
  return tiles;
}
