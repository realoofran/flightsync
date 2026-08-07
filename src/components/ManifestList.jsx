import { motion, AnimatePresence } from 'framer-motion';
import { colorFor } from '../lib/contentTypeColors.js';
import './ManifestList.css';

const STATUS_CONFIG = {
  link: { led: 'green', label: 'LINK' },
  unlink: { led: 'red', label: 'UNLINK' },
  unchanged: { led: 'cyan-dim', label: 'ACTIVE' },
  pending: { led: 'amber', label: 'CONFIRM' },
};

/**
 * @param {{ addons: Addon[], status: keyof typeof STATUS_CONFIG, onRowClick?: (addon) => void }} props
 */
export default function ManifestList({ addons, status, onRowClick, emptyLabel = 'Nothing here' }) {
  const cfg = STATUS_CONFIG[status];

  if (!addons?.length) {
    return <div className="manifest__empty">{emptyLabel}</div>;
  }

  return (
    <div className="manifest">
      <AnimatePresence initial={false}>
        {addons.map((addon, i) => {
          const color = colorFor(addon.contentType);
          return (
            <motion.div
              key={addon.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className={`manifest__row ${onRowClick ? 'manifest__row--clickable' : ''}`}
              style={{ borderLeftColor: color.hex }}
              onClick={() => onRowClick?.(addon)}
            >
              <span className={`led led--${cfg.led}`} />
              <span className="manifest__icao">
                {addon.matchedIcao || addon.matchedAircraftType || '????'}
              </span>
              <div className="manifest__titleblock">
                <span className="manifest__title">{addon.title}</span>
                {addon.categoryPath && <span className="manifest__category">{addon.categoryPath}</span>}
              </div>
              <span className="manifest__type" style={{ color: color.hex }}>{color.label}</span>
              <span className="manifest__status">{cfg.label}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
