import { useCallback, useState, useEffect } from 'react';
import { FolderOpen, Sun, Moon, Wand2, RefreshCw, Download, CheckCircle2, Contrast, Upload, FileJson, Power, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useUpdater } from '../lib/useUpdater.js';
import { LANGUAGES } from '../lib/i18n.js';
import { playChime } from '../lib/chime.js';
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
      if (result.ok) setBackupMessage({ kind: 'ok', text: t('backupSavedTo', { path: result.path }) });
    } catch (err) {
      setBackupMessage({ kind: 'error', text: err.message });
    } finally {
      setBackupBusy(false);
    }
  }, [t]);

  const importBackup = useCallback(async () => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await bridge.settings.importBackup();
      if (result.ok) {
        await refreshSettings();
        setBackupMessage({ kind: 'ok', text: t('backupImported') });
      }
    } catch (err) {
      setBackupMessage({ kind: 'error', text: err.message });
    } finally {
      setBackupBusy(false);
    }
  }, [refreshSettings, t]);

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
          {t('communityFolderHintPre')} <code>%APPDATA%\Microsoft Flight Simulator 2024\Packages\Community</code>{' '}
          {t('communityFolderHintPost')}
        </p>
        <div className="settings-row">
          <input readOnly value={settings.communityPath ?? ''} placeholder={t('communityNotSet')} />
          <button className="btn btn--ghost" onClick={detect} disabled={detecting}>
            <Wand2 size={14} className={detecting ? 'spin' : ''} /> {detecting ? t('detecting') : t('detectAutomatically')}
          </button>
          <button className="btn btn--ghost" onClick={() => pick('communityPath', 'Select MSFS Community folder')}>
            <FolderOpen size={14} /> {t('browse')}
          </button>
        </div>
        {detectFailed && (
          <p className="settings-hint" style={{ color: 'var(--amber-text)' }}>
            {t('detectFailedHint')}
          </p>
        )}
      </section>

      {settings.communityPath && (
        <section className="settings-block">
          <label className="settings-label">{t('vaultLabel')}</label>
          <p className="settings-hint">{t('vaultHint')}</p>
          <VaultDiagram communityPath={settings.communityPath} vaultPath={settings.vaultPath} />
        </section>
      )}

      <section className="settings-block">
        <label className="settings-label">{t('simbriefLabel')}</label>
        <p className="settings-hint">{t('simbriefHint')}</p>
        <div className="settings-row">
          <input
            defaultValue={settings.simbriefPilotId ?? ''}
            placeholder="e.g. 1598381"
            onBlur={(e) => updateSettings({ simbriefPilotId: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('vatsimCidLabel')}</label>
        <p className="settings-hint">{t('vatsimCidHint')}</p>
        <div className="settings-row">
          <input
            defaultValue={settings.vatsimCid ?? ''}
            placeholder="e.g. 1234567"
            onBlur={(e) => updateSettings({ vatsimCid: e.target.value })}
          />
        </div>
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('aiClassificationLabel')}</label>
        <p className="settings-hint">
          <strong>{t('aiFreeStrong')}</strong> {t('aiHintPart1')} <strong>{t('aiBillsStrong')}</strong>{' '}
          {t('aiHintPart2')}{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.{' '}
          {t('aiHintPart3')}{' '}
          <strong>{t('aiSkipStrong')}</strong> {t('aiHintPart4')}
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
          {t('trayCheckbox')}
        </label>
        <p className="settings-hint">{t('trayHint')}</p>
        {launchAtLogin !== null && (
          <>
            <label className="settings-row settings-row--checkbox" style={{ marginTop: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={launchAtLogin}
                onChange={(e) => toggleLaunchAtLogin(e.target.checked)}
              />
              <Power size={13} style={{ marginRight: 4 }} /> {t('launchAtLoginCheckbox')}
            </label>
            <p className="settings-hint">{t('launchAtLoginHint')}</p>
          </>
        )}
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('msfsLaunchLabel')}</label>
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.notifyOnMsfsLaunch}
            onChange={(e) => updateSettings({ notifyOnMsfsLaunch: e.target.checked })}
          />
          {t('msfsNotifyCheckbox')}
        </label>
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.autoSyncOnLaunch}
            onChange={(e) => updateSettings({ autoSyncOnLaunch: e.target.checked })}
          />
          {t('msfsAutoSyncCheckbox')}
        </label>
        <p className="settings-hint">{t('msfsLaunchHint')}</p>
      </section>

      <section className="settings-block">
        <label className="settings-label"><Volume2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t('soundLabel')}</label>
        <label className="settings-row settings-row--checkbox">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
          />
          {t('soundCheckbox')}
        </label>
        <div className="settings-row">
          <button className="btn btn--ghost btn--small" onClick={() => playChime('syncComplete')}>
            {t('testSound')}
          </button>
        </div>
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
        <label className="settings-label">{t('backupLabel')}</label>
        <p className="settings-hint">{t('backupHint')}</p>
        <div className="settings-row">
          <button className="btn btn--ghost btn--small" onClick={exportBackup} disabled={backupBusy}>
            <FileJson size={13} /> {t('exportSettings')}
          </button>
          <button className="btn btn--ghost btn--small" onClick={importBackup} disabled={backupBusy}>
            <Upload size={13} /> {t('importSettings')}
          </button>
        </div>
        {backupMessage && (
          <p className={`settings-hint settings-hint--${backupMessage.kind === 'error' ? 'error' : 'ok'}`}>
            {backupMessage.text}
          </p>
        )}
      </section>

      <section className="settings-block">
        <label className="settings-label">{t('updatesLabel')}</label>
        <div className="settings-row">
          <span className="settings-hint" style={{ margin: 0, flex: 1 }}>
            {status.state === 'ready' && t('updateReady', { version: status.version })}
            {status.state === 'downloading' && t('updateDownloading', { version: status.version ?? '', percent: status.percent ?? 0 })}
            {status.state === 'available' && t('updateAvailable', { version: status.version })}
            {status.state === 'checking' && t('updateChecking')}
            {status.state === 'up-to-date' && t('updateUpToDate', { version: __APP_VERSION__ })}
            {status.state === 'error' && t('updateError', { message: status.message })}
            {status.state === 'unavailable' && status.message}
            {status.state === 'idle' && t('updateIdle', { version: __APP_VERSION__ })}
          </span>
          {status.state === 'ready' ? (
            <button className="btn btn--primary btn--small" onClick={install}>
              <Download size={13} /> {t('restartAndInstall')}
            </button>
          ) : (
            <button className="btn btn--ghost btn--small" onClick={check} disabled={status.state === 'checking'}>
              {status.state === 'checking' ? <RefreshCw size={13} className="spin" /> : <CheckCircle2 size={13} />}
              {t('checkForUpdates')}
            </button>
          )}
        </div>
      </section>
    </motion.div>
  );
}
