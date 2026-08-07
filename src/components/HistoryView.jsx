import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Link2, Unlink, AlertCircle } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';

const bridge = getBridge();

export default function HistoryView() {
  const { t } = useAppSettings();
  const [history, setHistory] = useState(null);

  useEffect(() => {
    bridge.sync.history().then(setHistory);
  }, []);

  return (
    <motion.div className="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2>{t('historyTitle')}</h2>

      {history === null ? null : history.length === 0 ? (
        <div className="manifest__empty">{t('historyEmpty')}</div>
      ) : (
        <div className="manifest">
          {history.map((entry, i) => (
            <div key={i} className="history-row">
              <CheckCircle2 size={16} color={entry.errorCount > 0 ? 'var(--amber)' : 'var(--green)'} />
              <span className="history-row__time">{formatTimestamp(entry.timestamp)}</span>
              <span className="history-row__stat"><Link2 size={12} /> {entry.linkedCount}</span>
              <span className="history-row__stat"><Unlink size={12} /> {entry.unlinkedCount}</span>
              {entry.errorCount > 0 && (
                <span className="history-row__stat history-row__stat--error"><AlertCircle size={12} /> {entry.errorCount}</span>
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
