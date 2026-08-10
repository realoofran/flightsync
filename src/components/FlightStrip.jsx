import { useState } from 'react';
import { RotateCw, ImageDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { countryForFlight } from '../lib/countryFlags.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { getBridge } from '../lib/mockBridge.js';
import { buildFlightCardData } from '../lib/flightCardData.js';
import { drawFlightCard } from '../lib/flightCardRenderer.js';
import FlagSwatch from './FlagSwatch.jsx';
import './FlightStrip.css';

const bridge = getBridge();

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
export default function FlightStrip({ plan, loading, onRefresh, onPullFromSimbrief, onPullFromVatsim, onManualEntry, addonCount = 0 }) {
  const { t } = useAppSettings();
  const flagCountry = plan ? countryForFlight(plan) : null;
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  const shareCard = async () => {
    setSharing(true);
    try {
      const canvas = document.createElement('canvas');
      drawFlightCard(canvas, buildFlightCardData(plan, addonCount));
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const buffer = await blob.arrayBuffer();
      const suggestedName = `flightsync-${(plan.callsign || plan.origin || 'flight').replace(/[^a-z0-9]/gi, '')}-${plan.origin}-${plan.destination}.png`;
      const result = await bridge.flightCard.save(buffer, suggestedName);
      if (result.ok) {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch (err) {
      // Best-effort feature — a failure here (e.g. disk write error) should
      // never do anything worse than the icon quietly not confirming.
      console.error('[FlightSync] Failed to save flight card:', err);
    } finally {
      setSharing(false);
    }
  };

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
            <button className="btn btn--primary" onClick={onPullFromSimbrief}>{t('pullFromSimbrief')}</button>
            {onPullFromVatsim && (
              <button className="btn btn--ghost" onClick={onPullFromVatsim} title="Pull your own live filed flight plan from the VATSIM network">
                Pull from VATSIM
              </button>
            )}
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

            <div className="strip__actions">
              <motion.button
                className="strip__refresh"
                onClick={shareCard}
                disabled={sharing}
                title="Save this flight as a shareable image"
                aria-label="Save this flight as a shareable image"
                whileTap={{ scale: 0.9 }}
              >
                {shared ? <Check size={18} /> : <ImageDown size={18} />}
              </motion.button>
              {onRefresh && (
                <motion.button
                  className="strip__refresh"
                  onClick={onRefresh}
                  title={plan.source === 'vatsim' ? 'Re-fetch from VATSIM' : 'Re-fetch from SimBrief'}
                  aria-label={plan.source === 'vatsim' ? 'Re-fetch from VATSIM' : 'Re-fetch from SimBrief'}
                  whileTap={{ scale: 0.9 }}
                >
                  <RotateCw size={18} />
                </motion.button>
              )}
            </div>
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
            {plan.source === 'vatsim' && (
              <span className="tag tag--live"><span className="tag__live-dot" />LIVE ON VATSIM</span>
            )}
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
