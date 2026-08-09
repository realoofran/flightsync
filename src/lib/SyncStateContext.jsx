import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getBridge } from './mockBridge.js';
import { useAppSettings } from './AppSettingsContext.jsx';
import { distanceForRoute } from './greatCircle.js';
import airportCoords from './airportCoords.json';

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
  const { settings } = useAppSettings();
  const [plan, setPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [msfsLaunched, setMsfsLaunched] = useState(false);

  useEffect(() => {
    bridge.sync.history().then(h => setLastSync(h?.[0] ?? null));
  }, []);

  // For a sync applied (or undone) from somewhere other than this
  // provider's own applySync — currently just HistoryView's "Undo" button —
  // so the sidebar's "last sync" readout doesn't go stale after it.
  const refreshLastSync = useCallback(async () => {
    const h = await bridge.sync.history();
    setLastSync(h?.[0] ?? null);
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

  const pullFromVatsim = useCallback(async () => {
    setLoadingPlan(true);
    setError(null);
    setApplyResult(null);
    try {
      const fetched = await bridge.vatsim.fetchMyFlightPlan();
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
      // Log the flight once Community is set up to fly it — a route synced
      // twice with nothing left to change still counts, so this isn't
      // gated on linked/unlinked counts, only on there being a plan at all
      // (undo, triggered from HistoryView, never goes through this path).
      if (plan) {
        bridge.flightLog.record({
          origin: plan.origin,
          destination: plan.destination,
          aircraftIcao: plan.aircraftIcao,
          airlineIcao: plan.airlineIcao ?? null,
          callsign: plan.callsign ?? null,
          distanceNm: plan.ofp?.distanceNm ?? distanceForRoute(plan.origin, plan.destination, airportCoords),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }, [preview, plan]);

  // "Latest" ref so the one-time msfs:launched subscription below always
  // sees current preview/settings/applySync without having to tear down
  // and resubscribe the IPC listener on every render.
  const latestRef = useRef();
  latestRef.current = { preview, applySync, autoSyncOnLaunch: settings.autoSyncOnLaunch };

  useEffect(() => {
    const unsubscribe = bridge.msfs.onLaunched(() => {
      setMsfsLaunched(true);
      const { preview: p, applySync: apply, autoSyncOnLaunch } = latestRef.current;
      const pendingChanges = (p?.syncPlan.toLink.length ?? 0) + (p?.syncPlan.toUnlink.length ?? 0);
      if (autoSyncOnLaunch && p && pendingChanges > 0) {
        apply();
      }
    });
    return unsubscribe;
  }, []);

  return (
    <SyncStateContext.Provider
      value={{
        plan, loadingPlan, manualEntry, preview, applying, applyResult, error, lastSync, msfsLaunched,
        setManualEntry, pullFromSimbrief, pullFromVatsim, submitManualPlan, applySync, refreshLastSync,
        dismissMsfsLaunched: () => setMsfsLaunched(false),
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
