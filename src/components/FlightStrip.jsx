import { RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { countryForFlight } from '../lib/countryFlags.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import FlagSwatch from './FlagSwatch.jsx';
import './FlightStrip.css';

/**
 * Renders the current SimBrief plan as a paper-flight-strip-styled banner —
 * the app's signature element. Callsign is the hero: biggest text on the
 * whole card. The operating country's flag (see FlagSwatch.jsx — a real
 * vector graphic, not an emoji, which doesn't render as a colored flag
 * glyph in this app's Electron/Windows configuration) sits fully visible
 * next to it — small and unmasked, deliberately: a masked/faded large
 * version of a mostly-solid-colored flag (many real flags are dominated by
 * one field color) just reads as an unexplained color wash, not a flag.
 */
export default function FlightStrip({ plan, loading, onRefresh, onManualEntry }) {
  const { t } = useAppSettings();
  const flagCountry = plan ? countryForFlight(plan) : null;

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div key="loading" className="strip strip--loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="strip__pulse" />
          <span>{t('fetchingOfp')}</span>
        </motion.div>
      ) : !plan ? (
        <motion.div key="empty" className="strip strip--empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <span>{t('noActiveFlightPlan')}</span>
          <div className="strip__empty-actions">
            <button className="btn btn--primary" onClick={onRefresh}>{t('pullFromSimbrief')}</button>
            {onManualEntry && (
              <button className="btn btn--ghost" onClick={onManualEntry}>{t('manualEntry')}</button>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="plan"
          className="strip notched"
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          <div className="strip__top">
            <div className="strip__callsign-block">
              <AnimatePresence mode="wait">
                {flagCountry && (
                  <motion.div
                    key={flagCountry}
                    className="strip__flag-badge"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <FlagSwatch iso2={flagCountry} width={40} height={27} rounded={4} />
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="strip__callsign">{plan.callsign || '—'}</span>
            </div>

            <motion.button
              className="strip__refresh"
              onClick={onRefresh}
              title="Re-fetch from SimBrief"
              whileTap={{ scale: 0.9 }}
            >
              <RotateCw size={18} />
            </motion.button>
          </div>

          <div className="strip__route">
            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              {plan.origin}
            </motion.span>
            <span className="strip__arrow">→</span>
            <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}>
              {plan.destination}
            </motion.span>
          </div>

          <div className="strip__meta">
            {plan.airlineIcao && <span className="tag tag--amber">{plan.airlineIcao}</span>}
            <span className="tag">{plan.aircraftIcao}</span>
            {plan.alternates?.length > 0 && (
              <span className="tag tag--muted">ALTN {plan.alternates.join(' / ')}</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
