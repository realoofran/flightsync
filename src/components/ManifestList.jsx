import { motion, AnimatePresence } from 'framer-motion';
import { colorFor, cssColor } from '../lib/contentTypeColors.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import './ManifestList.css';

const STATUS_KEYS = {
  link: { led: 'green', labelKey: 'statusLink' },
  unlink: { led: 'red', labelKey: 'statusUnlink' },
  unchanged: { led: 'cyan-dim', labelKey: 'statusActive' },
  pending: { led: 'amber', labelKey: 'statusConfirm' },
};

/**
 * @param {{ addons: Addon[], status: keyof typeof STATUS_KEYS, onRowClick?: (addon) => void }} props
 */
export default function ManifestList({ addons, status, onRowClick, emptyLabel }) {
  const { t } = useAppSettings();
  const cfg = STATUS_KEYS[status];

  if (!addons?.length) {
    return <div className="manifest__empty">{emptyLabel ?? t('nothingHere')}</div>;
  }

  return (
    <div className="manifest">
      <AnimatePresence initial={false}>
        {addons.map((addon, i) => {
          const color = colorFor(addon.contentType);
          const colorCss = cssColor(addon.contentType);
          return (
            <motion.div
              key={addon.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className={`manifest__row ${onRowClick ? 'manifest__row--clickable' : ''}`}
              style={{ borderLeftColor: colorCss }}
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
              <span className="manifest__type" style={{ color: colorCss }}>{color.label}</span>
              <span className="manifest__status">{t(cfg.labelKey)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
