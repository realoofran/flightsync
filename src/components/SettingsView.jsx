import { useCallback, useState, useEffect } from 'react';
import { FolderOpen, Sun, Moon, Wand2, RefreshCw, Download, CheckCircle2, Contrast, Upload, FileJson, Power } from 'lucide-react';
import { motion } from 'framer-motion';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useUpdater } from '../lib/useUpdater.js';
import { LANGUAGES } from '../lib/i18n.js';
import VaultDiagram from './VaultDiagram.jsx';

const bridge = getBridge();

export default function SettingsView() {
  const { settings, updateSettings, refreshSettings, t } = useAppSettings();
  const { status, check, install } = useUpdater();
  const [detecting, setDetecting] = useState(false);
  const [detectFailed, setDetectFailed] = useState(false);
  const [backupMessage, setBackupMessage] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(null);

  useEffect(() => {
    bridge.app.getLaunchAtLogin().then(setLaunchAtLogin);
  }, []);

  const toggleLaunchAtLogin = useCallback(async (enabled) => {
    setLaunchAtLogin(enabled); // optimistic — this is OS state, not a DB write that could fail mid-flight
    await bridge.app.setLaunchAtLogin(enabled);
  }, []);

  const exportBackup = useCallback(async () => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await bridge.settings.exportBackup();
      if (result.ok) setBackupMessage({ kind: 'ok', text: `Saved to ${result.path}` });
    } catch (err) {
      setBackupMessage({ kind: 'error', text: err.message });
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const importBackup = useCallback(async () => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await bridge.settings.importBackup();
      if (result.ok) {
        await refreshSettings();
        setBackupMessage({ kind: 'ok', text: 'Settings imported.' });
      }
    } catch (err) {
      setBackupMessage({ kind: 'error', text: err.message });
    } finally {
      setBackupBusy(false);
    }
  }, [refreshSettings]);

  const pick = useCallback(async (key, title) => {
    const folder = await bridge.dialog.pickFolder(title);
    if (!folder) return;
    await updateSettings({ [key]: folder });
  }, [updateSettings]);

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

  return (
    <motion.div className="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2>{t('settingsTitle')}</h2>

      <section className="settings-block">
        <label className="settings-label">{t('communityFolderLabel')}</label>
        <p className="settings-hint">
          The one, real Community folder MSFS reads from — no separate library to maintain.
          Typically under <code>%APPDATA%\Microsoft Flight Simulator 2024\Packages\Community</code>{' '}
          (same location for both the Microsoft Store and Steam versions).
        </p>
        <div className="settings-row">
          <input readOnly value={settings.communityPath ?? ''} placeholder="Not set" />
          <button className="btn btn--ghost" onClick={detect} disabled={detecting}>
            <Wand2 size={14} className={detecting ? 'spin' : ''} /> {detecting ? 'Detecting…' : 'Detect automatically'}
          </button>
          <button className="btn btn--ghost" onClick={() => pick('communityPath', 'Select MSFS Community folder')}>
            <FolderOpen size={14} /> {t('browse')}
          </button>
        </div>
        {detectFailed && (
          <p className="settings-hint" style={{ color: 'var(--amber-text)' }}>
            Couldn't find an MSFS install automatically (checked Microsoft Store and every Steam
            library) — browse to it manually below.
          </p>
        )}
      </section>

      {settings.communityPath && (
        <section className="settings-block">
          <label className="settings-label">Where your addons actually live</label>
          <p className="settings-hint">
            The first time you scan, any addon already sitting directly in Community gets moved
            once into the vault below and replaced with a link — MSFS won't notice anything
            changed. From then on, syncing just adds or removes those links; nothing is ever
            deleted, and your real files always stay in the vault.
          </p>
          <VaultDiagram communityPath={settings.communityPath} vaultPath={settings.vaultPath} />
        </section>
      )}

      <section className="settings-block">
        <label className="settings-label">{t('simbriefLabel')}</label>
        <p className="settings-hint">Used to pull your most recent OFP.</p>
        <div className="settings-row">
          <input
            defaultValue={settings.simbriefPilotId ?? ''}
            placeholder="e.g. 1598381"
            onBlur={(e) => updateSettings({ simbriefPilotId: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">VATSIM CID</label>
        <p className="settings-hint">
          Optional — lets "Pull from VATSIM" in Route Sync grab your own live filed flight plan
          straight from the network whenever you're connected, no SimBrief account needed. Uses
          VATSIM's free public data feed; your CID is only used to find your own session in it and
          is never sent anywhere else.
        </p>
        <div className="settings-row">
          <input
            defaultValue={settings.vatsimCid ?? ''}
            placeholder="e.g. 1234567"
            onBlur={(e) => updateSettings({ vatsimCid: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">AI classification (optional — this costs real money)</label>
        <p className="settings-hint">
          <strong>FlightSync itself is free.</strong> This one feature is the exception: it calls
          Anthropic's Claude API directly using your own API key, and <strong>Anthropic bills you
          directly</strong> for it (typically a small fraction of a cent per addon with the model
          used here, but it is not free). FlightSync takes no cut and never sees a payment — the
          cost is entirely between you and Anthropic, get a key at{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          Only used by the "Classify with AI" button in Library, for addons the free built-in
          matching couldn't identify on its own — only folder/title names are sent, never file
          contents. Stored locally on this machine, never bundled with the app.{' '}
          <strong>Leave this blank to skip it entirely</strong> — everything else in FlightSync,
          including the rest of the addon matching, is completely free and works without it.
        </p>
        <div className="settings-row">
          <input
            type="password"
            autoComplete="off"
            defaultValue={settings.aiApiKey ?? ''}
            placeholder="sk-ant-…"
            onBlur={(e) => updateSettings({ aiApiKey: e.target.value || null })}
          />
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.includeAlternates}
            onChange={(e) => updateSettings({ includeAlternates: e.target.checked })}
          />
          {t('includeAlternates')}
        </label>
      </section>

      <section className="settings-block">
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.minimizeToTray}
            onChange={(e) => updateSettings({ minimizeToTray: e.target.checked })}
          />
          Keep running in the system tray when the window is closed
        </label>
        <p className="settings-hint">
          Off by default — closing the window quits FlightSync normally, same as any app. Turn
          this on if you want it to keep syncing quietly in the background (tray icon has a quick
          Rescan action) instead of closing when you click X.
        </p>
        {launchAtLogin !== null && (
          <>
            <label className="settings-row settings-row--checkbox" style={{ marginTop: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={launchAtLogin}
                onChange={(e) => toggleLaunchAtLogin(e.target.checked)}
              />
              <Power size={13} style={{ marginRight: 4 }} /> Launch FlightSync when Windows starts
            </label>
            <p className="settings-hint">
              Starts hidden in the tray (no window popping up on login) — pairs with "keep running
              in the tray" above so MSFS launch detection is watching from the moment you sign in.
              This is a Windows setting (Startup Apps), not saved in FlightSync's own config —
              removing it from Task Manager's Startup tab works too.
            </p>
          </>
        )}
      </section>

      <section className="settings-block">
        <label className="settings-label">When MSFS 2024 launches</label>
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.notifyOnMsfsLaunch}
            onChange={(e) => updateSettings({ notifyOnMsfsLaunch: e.target.checked })}
          />
          Notify me (on by default)
        </label>
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.autoSyncOnLaunch}
            onChange={(e) => updateSettings({ autoSyncOnLaunch: e.target.checked })}
          />
          Automatically apply the sync if a flight plan with pending changes is already loaded
        </label>
        <p className="settings-hint">
          FlightSync watches for MSFS 2024 starting and can tell you (or, if you turn on
          auto-apply, just handle it) right at the moment it matters — before the sim reads your
          Community folder. Auto-apply only fires if you already have a route loaded in Route Sync
          with changes waiting; it never invents a route on its own.
        </p>
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('theme')}</label>
        <div className="theme-toggle">
          <button
            className={`theme-toggle__option ${settings.theme === 'dark' ? 'theme-toggle__option--active' : ''}`}
            onClick={() => updateSettings({ theme: 'dark' })}
          >
            <Moon size={14} /> {t('themeDark')}
          </button>
          <button
            className={`theme-toggle__option ${settings.theme === 'light' ? 'theme-toggle__option--active' : ''}`}
            onClick={() => updateSettings({ theme: 'light' })}
          >
            <Sun size={14} /> {t('themeLight')}
          </button>
          <button
            className={`theme-toggle__option ${settings.theme === 'high-contrast' ? 'theme-toggle__option--active' : ''}`}
            onClick={() => updateSettings({ theme: 'high-contrast' })}
          >
            <Contrast size={14} /> {t('themeHighContrast')}
          </button>
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('language')}</label>
        <div className="chip-row">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              className={`filter-chip ${settings.language === l.code ? 'filter-chip--active' : ''}`}
              onClick={() => updateSettings({ language: l.code })}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">Backup &amp; restore</label>
        <p className="settings-hint">
          Save your settings (folders, SimBrief ID, theme, language) to a file, or restore them
          later — handy before reinstalling Windows or moving to a new PC. Your Anthropic API key
          is never included in the export; re-enter it after importing if you use AI classification.
        </p>
        <div className="settings-row">
          <button className="btn btn--ghost btn--small" onClick={exportBackup} disabled={backupBusy}>
            <FileJson size={13} /> Export settings
          </button>
          <button className="btn btn--ghost btn--small" onClick={importBackup} disabled={backupBusy}>
            <Upload size={13} /> Import settings
          </button>
        </div>
        {backupMessage && (
          <p className={`settings-hint settings-hint--${backupMessage.kind === 'error' ? 'error' : 'ok'}`}>
            {backupMessage.text}
          </p>
        )}
      </section>

      <section className="settings-block">
        <label className="settings-label">Updates</label>
        <div className="settings-row">
          <span className="settings-hint" style={{ margin: 0, flex: 1 }}>
            {status.state === 'ready' && `Version ${status.version} is downloaded and ready to install.`}
            {status.state === 'downloading' && `Downloading version ${status.version ?? ''}… ${status.percent ?? 0}%`}
            {status.state === 'available' && `Version ${status.version} is available and downloading automatically.`}
            {status.state === 'checking' && 'Checking for updates…'}
            {status.state === 'up-to-date' && `You're on the latest version (v${__APP_VERSION__}).`}
            {status.state === 'error' && `Couldn't check for updates: ${status.message}`}
            {status.state === 'unavailable' && status.message}
            {status.state === 'idle' && `Currently on v${__APP_VERSION__}.`}
          </span>
          {status.state === 'ready' ? (
            <button className="btn btn--primary btn--small" onClick={install}>
              <Download size={13} /> Restart &amp; install
            </button>
          ) : (
            <button className="btn btn--ghost btn--small" onClick={check} disabled={status.state === 'checking'}>
              {status.state === 'checking' ? <RefreshCw size={13} className="spin" /> : <CheckCircle2 size={13} />}
              Check for updates
            </button>
          )}
        </div>
      </section>
    </motion.div>
  );
}
