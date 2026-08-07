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

  const t = useCallback((key) => translate(settings?.language ?? 'en', key), [settings?.language]);

  if (!settings) return null;

  return (
    <AppSettingsContext.Provider value={{ settings, updateSettings, t }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
