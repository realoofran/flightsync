import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { lonToPx, latToPx, pickZoomToFit, tilesForViewport, osmTileUrl } from '../lib/mercator.js';
import airportCoords from '../lib/airportCoords.json';
import './SceneryMap.css';

// Same static-viewport approach as RouteMap.jsx (fixed size, auto-fit zoom,
// no pan/zoom interaction) — real OSM tiles, free, no API key.
const MAP_W = 800;
const MAP_H = 420;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;

/**
 * Groups SCENERY addons by resolved airport (matchedIcao), looks up each
 * airport's coordinates from the bundled OurAirports slice (large + medium
 * airports only — see scripts/generate-airport-coords.mjs). Addons whose
 * ICAO isn't in that dataset (small/military fields, or a still-unresolved
 * match) simply can't be plotted — surfaced as a count, not hidden silently.
 */
function groupSceneryAddons(addons) {
  const scenery = (addons ?? []).filter(a => a.contentType === 'SCENERY' && a.matchedIcao);
  const byIcao = new Map();
  let plottedCount = 0;

  for (const a of scenery) {
    const coord = airportCoords[a.matchedIcao];
    if (!coord) continue;
    plottedCount++;
    if (!byIcao.has(a.matchedIcao)) {
      byIcao.set(a.matchedIcao, { icao: a.matchedIcao, lat: coord[0], lon: coord[1], region: a.region, titles: [] });
    }
    byIcao.get(a.matchedIcao).titles.push(a.title);
  }

  return { groups: [...byIcao.values()], plottedCount, totalCount: scenery.length };
}

function radiusFor(count) {
  return 6 + Math.min(count - 1, 4) * 1.75;
}

export default function SceneryMap({ addons }) {
  const [hoveredIcao, setHoveredIcao] = useState(null);
  const { groups, plottedCount, totalCount } = useMemo(() => groupSceneryAddons(addons), [addons]);

  const projected = useMemo(() => {
    if (groups.length === 0) return null;

    const lats = groups.map(g => g.lat);
    const lons = groups.map(g => g.lon);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

    const zoom = pickZoomToFit(groups, MAP_W, MAP_H, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, fitFraction: 0.82 });

    const centerPx = lonToPx((lonMin + lonMax) / 2, zoom);
    const centerPy = latToPx((latMin + latMax) / 2, zoom);
    const offsetX = centerPx - MAP_W / 2;
    const offsetY = centerPy - MAP_H / 2;

    const points = groups.map(g => ({
      ...g,
      x: lonToPx(g.lon, zoom) - offsetX,
      y: latToPx(g.lat, zoom) - offsetY,
    }));

    return { tiles: tilesForViewport(offsetX, offsetY, MAP_W, MAP_H, zoom), points };
  }, [groups]);

  if (!projected) {
    return (
      <div className="scenery-map scenery-map--empty notched">
        <span>NO SCENERY ADDONS WITH A KNOWN LOCATION YET</span>
      </div>
    );
  }

  const { tiles, points } = projected;
  const hovered = points.find(p => p.icao === hoveredIcao);

  return (
    <div className="scenery-map notched">
      <div className="scenery-map__header">
        <span>SCENERY MAP</span>
        <span className="scenery-map__count">
          {plottedCount} of {totalCount} plotted
          {plottedCount < totalCount && ` — ${totalCount - plottedCount} airport(s) not in the bundled dataset`}
        </span>
      </div>

      <div className="scenery-map__viewport" style={{ width: MAP_W, height: MAP_H }}>
        {tiles.map((t) => (
          <img
            key={`${t.z}-${t.x}-${t.y}`}
            src={osmTileUrl(t.z, ((t.x % t.wrap) + t.wrap) % t.wrap, t.y)}
            className="scenery-map__tile"
            style={{ left: t.px, top: t.py, width: 256, height: 256 }}
            loading="lazy"
            draggable={false}
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        ))}

        <svg className="scenery-map__overlay" viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H}>
          {points.map((p) => (
            <g
              key={p.icao}
              transform={`translate(${p.x}, ${p.y})`}
              onMouseEnter={() => setHoveredIcao(p.icao)}
              onMouseLeave={() => setHoveredIcao((cur) => (cur === p.icao ? null : cur))}
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
            >
              {p.icao === hoveredIcao && (
                <circle r={radiusFor(p.titles.length) + 6} className="scenery-map__node-ring" />
              )}
              <motion.circle
                r={radiusFor(p.titles.length)}
                className="scenery-map__node"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              {p.titles.length > 1 && (
                <text y="3.5" textAnchor="middle" className="scenery-map__node-count">{p.titles.length}</text>
              )}
            </g>
          ))}
        </svg>

        {hovered && (
          <div
            className="scenery-map__tooltip"
            style={{ left: Math.min(hovered.x + 14, MAP_W - 210), top: Math.max(hovered.y - 10, 8) }}
          >
            <div className="scenery-map__tooltip-icao">{hovered.icao}{hovered.region ? ` · ${hovered.region}` : ''}</div>
            {hovered.titles.map((title, i) => (
              <div key={i} className="scenery-map__tooltip-title">{title}</div>
            ))}
          </div>
        )}
      </div>
      <div className="scenery-map__attribution">© OpenStreetMap contributors</div>
    </div>
  );
}
