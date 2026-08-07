import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CONTENT_TYPE_COLORS, cssColor } from '../lib/contentTypeColors.js';

const SIZE = 92;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENTS = [
  { key: 'scenery', type: 'SCENERY' },
  { key: 'aircraft', type: 'AIRCRAFT' },
  { key: 'livery', type: 'LIVERY' },
  { key: 'other', type: 'OTHER' },
];

/** Small donut chart of the library's addon-type mix — the sidebar's stat
 * numbers alone read as a spreadsheet; an actual visual gives the same
 * information a shape you can read at a glance. */
export default function AddonBreakdown({ stats }) {
  const total = stats.total || 1;

  const arcs = useMemo(() => {
    let offset = 0;
    return SEGMENTS.map(seg => {
      const value = stats[seg.key] ?? 0;
      const fraction = value / total;
      const length = fraction * CIRCUMFERENCE;
      const arc = { ...seg, value, dasharray: `${length} ${CIRCUMFERENCE - length}`, dashoffset: -offset };
      offset += length;
      return arc;
    });
  }, [stats, total]);

  return (
    <div className="addon-breakdown">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="addon-breakdown__ring">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--glass-border)" strokeWidth={STROKE} />
        {arcs.filter(a => a.value > 0).map((arc, i) => (
          <motion.circle
            key={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={cssColor(arc.type)}
            strokeWidth={STROKE}
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
          />
        ))}
        <text x={SIZE / 2} y={SIZE / 2 - 3} textAnchor="middle" className="addon-breakdown__total">{stats.total}</text>
        <text x={SIZE / 2} y={SIZE / 2 + 12} textAnchor="middle" className="addon-breakdown__total-label">TOTAL</text>
      </svg>

      <div className="addon-breakdown__legend">
        {SEGMENTS.map(seg => (
          <div key={seg.key} className="addon-breakdown__legend-row">
            <span className="addon-breakdown__legend-dot" style={{ background: cssColor(seg.type) }} />
            <span className="addon-breakdown__legend-label">{CONTENT_TYPE_COLORS[seg.type].label}</span>
            <span className="addon-breakdown__legend-value">{stats[seg.key] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
