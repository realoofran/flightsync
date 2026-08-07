import { useMemo, useRef, useState } from 'react';
import { motion, useAnimationFrame } from 'framer-motion';
import './RouteMap.css';

// Real map tiles via OpenStreetMap's standard tile server — free, no API
// key, attribution required by their license (see .route-map__attribution
// below). This is a static "slippy map" render (fixed viewport sized to
// fit the route, no pan/zoom interaction), so tile usage per flight plan
// load is small and bounded — well within OSM's tile usage policy for a
// small desktop app. Requires internet to actually load imagery.
const TILE_SIZE = 256;
const OSM_TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const MAP_W = 800;
const MAP_H = 420;
const MIN_ZOOM = 2;
const MAX_ZOOM = 12;

function lonToPx(lon, zoom) {
  return ((lon + 180) / 360) * Math.pow(2, zoom) * TILE_SIZE;
}
function latToPx(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom) * TILE_SIZE;
}

export default function RouteMap({ plan }) {
  const projected = useMemo(() => project(plan), [plan]);

  if (!projected) {
    return (
      <div className="route-map route-map--empty notched">
        <span>NO ROUTE TO DISPLAY</span>
      </div>
    );
  }

  const { tiles, origin, destination, waypoints, pathD, hasPath } = projected;

  return (
    <div className="route-map notched">
      <div className="route-map__viewport" style={{ width: MAP_W, height: MAP_H }}>
        {tiles.map((t) => (
          <img
            key={`${t.z}-${t.x}-${t.y}`}
            src={OSM_TILE_URL(t.z, ((t.x % t.wrap) + t.wrap) % t.wrap, t.y)}
            className="route-map__tile"
            style={{ left: t.px, top: t.py, width: TILE_SIZE, height: TILE_SIZE }}
            loading="lazy"
            draggable={false}
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        ))}

        <svg className="route-map__overlay" viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H}>
          {hasPath && (
            <>
              <path d={pathD} className="route-map__path-glow" fill="none" />
              <motion.path
                d={pathD}
                className="route-map__path"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </>
          )}

          {waypoints.map((wp, i) => (
            <g key={i} transform={`translate(${wp.x}, ${wp.y})`}>
              <circle r="3.5" className="route-map__waypoint" />
            </g>
          ))}

          <g transform={`translate(${origin.x}, ${origin.y})`}>
            <circle r="14" className="route-map__node-ring route-map__node-ring--origin route-map__node-ring--pulse" />
            <circle r="8" className="route-map__node route-map__node--origin" />
            <text x="0" y="-20" className="route-map__label route-map__label--origin">{plan.origin}</text>
          </g>

          <g transform={`translate(${destination.x}, ${destination.y})`}>
            <path d="M 0 -11 L 9 8 L 0 4 L -9 8 Z" className="route-map__node route-map__node--dest" />
            <text x="0" y="-20" className="route-map__label route-map__label--dest">{plan.destination}</text>
          </g>

          {hasPath && <PlaneMarker pathD={pathD} />}
        </svg>
      </div>
      <div className="route-map__attribution">© OpenStreetMap contributors</div>
    </div>
  );
}

const PLANE_LOOP_SECONDS = 9;

/** A small aircraft glyph gliding along the route path, purely decorative —
 * not a live position feed (FlightSync has no SimConnect link). Positioned
 * every frame via SVG's getPointAtLength() against a hidden reference
 * <path>, not CSS offset-path (inconsistent support for SVG elements). */
function PlaneMarker({ pathD }) {
  const pathRef = useRef(null);
  const [transform, setTransform] = useState('translate(-9999,-9999)');

  useAnimationFrame((time) => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    if (!total) return;

    const t = (time / 1000 / PLANE_LOOP_SECONDS) % 1;
    const eps = Math.max(total * 0.002, 0.5);
    const p = path.getPointAtLength(t * total);
    const pAhead = path.getPointAtLength(Math.min(t * total + eps, total));
    const angle = (Math.atan2(pAhead.y - p.y, pAhead.x - p.x) * 180) / Math.PI;
    setTransform(`translate(${p.x},${p.y}) rotate(${angle + 90})`);
  });

  return (
    <g className="route-map__plane">
      <path ref={pathRef} d={pathD} fill="none" stroke="none" style={{ visibility: 'hidden' }} />
      <g transform={transform}>
        <path d="M 0 -6 L 4 4 L 1 3 L 1 7 L -1 7 L -1 3 L -4 4 Z" />
      </g>
    </g>
  );
}

function project(plan) {
  const o = plan?.originCoord;
  const d = plan?.destinationCoord;
  if (!o || !d || o.lat == null || d.lat == null) return null;

  const routePts = [o, ...(plan.routePoints ?? []), d].filter(p => p.lat != null && p.lon != null);
  const lats = routePts.map(p => p.lat);
  const lons = routePts.map(p => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;

  // Pick the highest zoom (most detail) at which the whole route (plus a
  // margin) still fits inside the viewport.
  let zoom = MAX_ZOOM;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const w = lonToPx(lonMax, z) - lonToPx(lonMin, z);
    const h = latToPx(latMin, z) - latToPx(latMax, z);
    if (w <= MAP_W * 0.7 && h <= MAP_H * 0.7) { zoom = z; break; }
    zoom = z;
  }

  const centerPx = lonToPx(centerLon, zoom);
  const centerPy = latToPx(centerLat, zoom);
  const offsetX = centerPx - MAP_W / 2;
  const offsetY = centerPy - MAP_H / 2;

  const toXY = (lat, lon) => ({ x: lonToPx(lon, zoom) - offsetX, y: latToPx(lat, zoom) - offsetY });

  const origin = toXY(o.lat, o.lon);
  const destination = toXY(d.lat, d.lon);
  const waypoints = (plan.routePoints ?? []).map(p => toXY(p.lat, p.lon));
  const allPts = [origin, ...waypoints, destination];
  const pathD = allPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const worldTiles = Math.pow(2, zoom);
  const tileXStart = Math.floor(offsetX / TILE_SIZE) - 1;
  const tileXEnd = Math.floor((offsetX + MAP_W) / TILE_SIZE) + 1;
  const tileYStart = Math.max(0, Math.floor(offsetY / TILE_SIZE) - 1);
  const tileYEnd = Math.min(worldTiles - 1, Math.floor((offsetY + MAP_H) / TILE_SIZE) + 1);

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

  return { tiles, origin, destination, waypoints, pathD, hasPath: allPts.length > 1 };
}
