import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBridge } from './mockBridge.js';
import { translate } from './i18n.js';

const bridge = getBridge();
const AppSettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    bridge.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    if (settings?.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings?.theme]);

  const updateSettings = useCallback(async (patch) => {
    const updated = await bridge.settings.update(patch);
    setSettings(updated);
    return updated;
  }, []);

  // For flows that change settings through a DIFFERENT bridge call (e.g.
  // importing a backup file, which merges server-side) rather than
  // updateSettings' own patch — pulls the current values back in so the
  // rest of the app (theme, language, etc.) picks up the change immediately.
  const refreshSettings = useCallback(async () => {
    const fresh = await bridge.settings.get();
    setSettings(fresh);
    return fresh;
  }, []);

  const t = useCallback((key, params) => translate(settings?.language ?? 'en', key, params), [settings?.language]);

  if (!settings) return null;

  return (
    <AppSettingsContext.Provider value={{ settings, updateSettings, refreshSettings, t }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
