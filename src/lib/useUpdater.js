import { useState, useEffect, useCallback } from 'react';
import { getBridge } from './mockBridge.js';

const bridge = getBridge();

/**
 * Thin wrapper around the updater bridge — subscribes to main-process push
 * events (checking/available/downloading/ready/error) for the lifetime of
 * whatever component uses it, and exposes check()/install() actions.
 */
export function useUpdater() {
  const [status, setStatus] = useState({ state: 'idle' });

  useEffect(() => {
    const unsubscribe = bridge.updater.onStatus(setStatus);
    return unsubscribe;
  }, []);

  const check = useCallback(async () => {
    const result = await bridge.updater.check();
    if (result?.state) setStatus(result);
  }, []);

  const install = useCallback(() => {
    bridge.updater.install();
  }, []);

  return { status, check, install };
}
