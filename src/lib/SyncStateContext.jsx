import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getBridge } from './mockBridge.js';

const bridge = getBridge();
const SyncStateContext = createContext(null);

/**
 * Holds the whole "pull a plan -> preview -> apply" flow at a level ABOVE
 * the tab switcher in App.jsx, instead of as local state inside SyncView.
 * Previously this lived in SyncView's own useState, so navigating to
 * Library/Settings and back unmounted SyncView and threw the fetched plan
 * away — the app looked like it "forgot" your flight and made you pull it
 * again every time. Provider is mounted once at the app root, so this
 * survives tab switches.
 */
export function SyncStateProvider({ children }) {
  const [plan, setPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    bridge.sync.history().then(h => setLastSync(h?.[0] ?? null));
  }, []);

  const pullFromSimbrief = useCallback(async () => {
    setLoadingPlan(true);
    setError(null);
    setApplyResult(null);
    try {
      const fetched = await bridge.simbrief.fetchLatest();
      setPlan(fetched);
      const p = await bridge.sync.preview(fetched);
      setPreview(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  const submitManualPlan = useCallback(async (manualPlan) => {
    setManualEntry(false);
    setError(null);
    setApplyResult(null);
    setPlan(manualPlan);
    setLoadingPlan(true);
    try {
      const p = await bridge.sync.preview(manualPlan);
      setPreview(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  const applySync = useCallback(async () => {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const result = await bridge.sync.apply(preview.syncPlan);
      setApplyResult(result);
      setLastSync({
        timestamp: new Date().toISOString(),
        linkedCount: result.linked.length,
        unlinkedCount: result.unlinked.length,
        errorCount: result.errors.length,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }, [preview]);

  return (
    <SyncStateContext.Provider
      value={{
        plan, loadingPlan, manualEntry, preview, applying, applyResult, error, lastSync,
        setManualEntry, pullFromSimbrief, submitManualPlan, applySync,
      }}
    >
      {children}
    </SyncStateContext.Provider>
  );
}

export function useSyncState() {
  const ctx = useContext(SyncStateContext);
  if (!ctx) throw new Error('useSyncState must be used within SyncStateProvider');
  return ctx;
}
