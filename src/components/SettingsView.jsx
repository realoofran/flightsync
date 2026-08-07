import { useCallback, useState } from 'react';
import { FolderOpen, Sun, Moon, Wand2, RefreshCw, Download, CheckCircle2, Contrast } from 'lucide-react';
import { motion } from 'framer-motion';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useUpdater } from '../lib/useUpdater.js';
import { LANGUAGES } from '../lib/i18n.js';
import VaultDiagram from './VaultDiagram.jsx';

const bridge = getBridge();

export default function SettingsView() {
  const { settings, updateSettings, t } = useAppSettings();
  const { status, check, install } = useUpdater();
  const [detecting, setDetecting] = useState(false);
  const [detectFailed, setDetectFailed] = useState(false);

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
        <label className="settings-label">AI classification (optional)</label>
        <p className="settings-hint">
          Your own <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic API key</a> —
          only used by the "Classify with AI" button in Library, for addons the built-in matching
          couldn't identify on its own. Only folder/title names are sent, never file contents.
          Stored locally on this machine, never bundled with the app. Leave blank to skip this
          entirely — everything else works without it.
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
