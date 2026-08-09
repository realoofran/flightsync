import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Link2, Unlink, AlertCircle, Undo2, Check } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useSyncState } from '../lib/SyncStateContext.jsx';

const bridge = getBridge();
const CONFIRM_TIMEOUT_MS = 4000;

export default function HistoryView() {
  const { t } = useAppSettings();
  const { refreshLastSync } = useSyncState();
  const [history, setHistory] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState(null);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const confirmTimerRef = useRef(null);

  const load = useCallback(() => {
    bridge.sync.history().then(setHistory);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  const undo = useCallback(async () => {
    setUndoing(true);
    setUndoError(null);
    try {
      await bridge.sync.undo();
      load();
      await refreshLastSync();
    } catch (err) {
      setUndoError(err.message);
    } finally {
      setUndoing(false);
      setConfirmingUndo(false);
    }
  }, [load, refreshLastSync]);

  // This is the one action in the app that immediately modifies real files
  // on a single click with no preceding preview screen (unlike a normal
  // sync, which always shows what will change before Apply) — so it gets
  // its own lightweight two-click confirm instead. First click arms it;
  // it auto-disarms after a few seconds so it can never fire from a stray
  // click days later.
  const requestUndo = useCallback(() => {
    if (confirmingUndo) {
      clearTimeout(confirmTimerRef.current);
      undo();
      return;
    }
    setConfirmingUndo(true);
    confirmTimerRef.current = setTimeout(() => setConfirmingUndo(false), CONFIRM_TIMEOUT_MS);
  }, [confirmingUndo, undo]);

  // Only the single most recent entry can be undone — reversing an older
  // one while a newer sync has since run could clobber changes made in
  // between, so it's deliberately not offered.
  const mostRecentUndoable = history?.[0]?.linkedIds || history?.[0]?.unlinkedIds ? history[0] : null;

  return (
    <motion.div className="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2>{t('historyTitle')}</h2>

      {undoError && <div className="banner banner--error">{undoError}</div>}

      {history === null ? null : history.length === 0 ? (
        <div className="manifest__empty">{t('historyEmpty')}</div>
      ) : (
        <div className="manifest">
          {history.map((entry, i) => (
            <div key={i} className="history-row">
              <CheckCircle2 size={16} color={entry.errorCount > 0 ? 'var(--amber-text)' : 'var(--green-text)'} />
              <span className="history-row__time">{formatTimestamp(entry.timestamp)}</span>
              {entry.isUndo && <span className="history-row__badge">UNDO</span>}
              <span className="history-row__stat"><Link2 size={12} /> {entry.linkedCount}</span>
              <span className="history-row__stat"><Unlink size={12} /> {entry.unlinkedCount}</span>
              {entry.errorCount > 0 && (
                <span className="history-row__stat history-row__stat--error"><AlertCircle size={12} /> {entry.errorCount}</span>
              )}
              {i === 0 && mostRecentUndoable && (
                <button
                  className={`btn btn--small history-row__undo ${confirmingUndo ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={requestUndo}
                  disabled={undoing}
                  title={
                    confirmingUndo
                      ? 'Click again to confirm — this changes real files in Community right now'
                      : 'Reverse this exact sync — re-link what it unlinked, unlink what it linked'
                  }
                >
                  {confirmingUndo ? <Check size={12} /> : <Undo2 size={12} />}
                  {undoing ? 'Undoing…' : confirmingUndo ? 'Confirm undo?' : 'Undo'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
