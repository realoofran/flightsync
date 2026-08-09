import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Wand2, CheckCircle2, ArrowRight, SkipForward } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import Logo from './Logo.jsx';
import './OnboardingWizard.css';

const bridge = getBridge();
const STEPS = ['welcome', 'folder', 'simbrief', 'scan'];

const stepMotion = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
};

/**
 * Shown instead of the normal app shell until settings.onboardingComplete is
 * true (see App.jsx). Guides a first-time public user through the two
 * things FlightSync can't function without — a Community folder, and
 * (optionally) SimBrief — plus an initial scan, instead of dropping them on
 * a blank Settings tab.
 */
export default function OnboardingWizard() {
  const { settings, updateSettings } = useAppSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [detectFailed, setDetectFailed] = useState(false);
  const [pilotId, setPilotId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);

  const step = STEPS[stepIndex];
  const next = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));

  const detect = useCallback(async () => {
    setDetecting(true);
    setDetectFailed(false);
    try {
      const found = await bridge.settings.detectCommunityPath();
      if (found) {
        await updateSettings({ communityPath: found });
      } else {
        setDetectFailed(true);
      }
    } finally {
      setDetecting(false);
    }
  }, [updateSettings]);

  const pickFolder = useCallback(async () => {
    const folder = await bridge.dialog.pickFolder('Select MSFS Community folder');
    if (folder) await updateSettings({ communityPath: folder });
  }, [updateSettings]);

  const savePilotIdAndContinue = useCallback(async () => {
    if (pilotId.trim()) await updateSettings({ simbriefPilotId: pilotId.trim() });
    next();
  }, [pilotId]);

  const runFirstScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const { addons, warnings } = await bridge.library.scan();
      setScanResult({
        count: addons.length,
        pending: addons.filter(a => !a.confirmed).length,
        warnings: warnings.length,
      });
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  const finish = useCallback(() => {
    updateSettings({ onboardingComplete: true });
  }, [updateSettings]);

  return (
    <div className="onboarding">
      <div className="onboarding__card glass notched">
        <div className="onboarding__progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`onboarding__dot ${i <= stepIndex ? 'onboarding__dot--active' : ''}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div key="welcome" className="onboarding__step" {...stepMotion}>
              <div className="onboarding__logo">
                <Logo size={64} wordmark />
              </div>
              <h1>Welcome to FlightSync</h1>
              <p>
                FlightSync keeps only the addons your current flight actually needs linked into
                MSFS — everything else stays safely in a local vault instead of cluttering (or
                slowing down) your Community folder. Two-minute setup, then you're flying.
              </p>
              <button className="btn btn--primary btn--full" onClick={next}>
                Get started <ArrowRight size={14} />
              </button>
            </motion.div>
          )}

          {step === 'folder' && (
            <motion.div key="folder" className="onboarding__step" {...stepMotion}>
              <h2>Where's your Community folder?</h2>
              <p className="onboarding__hint">
                The one real folder MSFS reads addons from. FlightSync only needs this single
                folder — no separate library to set up.
              </p>
              <input
                readOnly
                className="onboarding__path"
                value={settings.communityPath ?? ''}
                placeholder="Not set yet"
              />
              <div className="onboarding__row">
                <button className="btn btn--ghost" onClick={detect} disabled={detecting}>
                  <Wand2 size={14} className={detecting ? 'spin' : ''} />
                  {detecting ? 'Detecting…' : 'Detect automatically'}
                </button>
                <button className="btn btn--ghost" onClick={pickFolder}>
                  <FolderOpen size={14} /> Browse manually
                </button>
              </div>
              {detectFailed && (
                <p className="onboarding__hint onboarding__hint--warn">
                  Couldn't find an MSFS install automatically (checked Microsoft Store and every
                  Steam library). Browse manually — it's usually under your MSFS install's{' '}
                  <code>Community</code> folder.
                </p>
              )}
              <button className="btn btn--primary btn--full" onClick={next} disabled={!settings.communityPath}>
                Continue <ArrowRight size={14} />
              </button>
            </motion.div>
          )}

          {step === 'simbrief' && (
            <motion.div key="simbrief" className="onboarding__step" {...stepMotion}>
              <h2>Connect SimBrief</h2>
              <p className="onboarding__hint">
                Optional, but lets FlightSync pull your route automatically instead of typing it
                in by hand every flight. You can add or change this later in Settings.
              </p>
              <input
                className="onboarding__path"
                value={pilotId}
                onChange={(e) => setPilotId(e.target.value)}
                placeholder="SimBrief pilot ID or username, e.g. 1598381"
              />
              <div className="onboarding__row">
                <button className="btn btn--ghost" onClick={next}>
                  <SkipForward size={14} /> Skip for now
                </button>
                <button className="btn btn--primary" onClick={savePilotIdAndContinue}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'scan' && (
            <motion.div key="scan" className="onboarding__step" {...stepMotion}>
              <h2>First scan</h2>
              {!scanResult && (
                <>
                  <p className="onboarding__hint">
                    FlightSync will look through your Community folder, move any addons it finds
                    into a vault folder next to it, and link them straight back — MSFS won't see
                    any difference. Nothing is ever deleted.
                  </p>
                  <p className="onboarding__hint onboarding__hint--warn">
                    Important: that vault folder becomes the ONLY real copy of those addons — the
                    Community folder will just hold links to it. Never delete or move the vault
                    folder itself; that permanently removes whatever's inside it from MSFS. (Every
                    vault folder has a README inside explaining this too.)
                  </p>
                </>
              )}

              {scanError && <div className="banner banner--error">{scanError}</div>}

              {!scanResult ? (
                <button className="btn btn--primary btn--full" onClick={runFirstScan} disabled={scanning}>
                  {scanning ? 'Scanning…' : 'Scan Community folder'}
                </button>
              ) : (
                <>
                  <div className="onboarding__result">
                    <CheckCircle2 size={22} color="var(--green-text)" />
                    <span>
                      {scanResult.count} addon{scanResult.count === 1 ? '' : 's'} found
                      {scanResult.pending > 0 ? `, ${scanResult.pending} need confirmation` : ''}.
                    </span>
                  </div>
                  <button className="btn btn--primary btn--full" onClick={finish}>
                    Start using FlightSync
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
