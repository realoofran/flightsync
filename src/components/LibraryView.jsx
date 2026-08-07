import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Boxes, FolderSearch, Sparkles, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { CONTENT_TYPE_COLORS, colorFor, cssColor } from '../lib/contentTypeColors.js';
import { KNOWN_REGIONS } from '../lib/regions.js';
import ConfirmForm from './ConfirmForm.jsx';
import VaultDiagram from './VaultDiagram.jsx';
import SceneryMap from './SceneryMap.jsx';

const bridge = getBridge();
const TYPE_FILTERS = ['ALL', 'SCENERY', 'LIVERY', 'AIRCRAFT', 'OTHER'];

const WARNING_EXPLAIN = {
  'no-manifest': "No manifest.json/layout.json found inside — can't identify these as addons, left untouched:",
  'depth-limit': 'Nested too deep to fully scan (10+ folders):',
  'read-error': "Couldn't read these folders (permissions, broken links, etc.):",
  'migrate-error': 'Failed to move these into the vault:',
  'name-conflict': 'Two addons share the same folder name — only one can be linked at a time:',
};

function groupWarnings(warnings) {
  const byCode = new Map();
  for (const w of warnings) {
    const code = w.code ?? 'other';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(w);
  }
  return [...byCode.entries()];
}

// Mirrors aiClassifier.js's needsAiClassification() — kept as a small
// duplicated predicate rather than a shared import, since electron/lib is
// Node-only and can't be bundled into the renderer.
function needsAiClassification(addon) {
  if (addon.contentType === 'OTHER') return true;
  if (addon.contentType === 'SCENERY') return !addon.matchedIcao;
  if (addon.contentType === 'AIRCRAFT' || addon.contentType === 'LIVERY') return !addon.matchedAircraftType;
  return false;
}

export default function LibraryView() {
  const { t, settings } = useAppSettings();
  const [showVault, setShowVault] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [addons, setAddons] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanWarnings, setScanWarnings] = useState([]);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [regionFilter, setRegionFilter] = useState('ALL');

  const load = useCallback(async () => {
    setAddons(await bridge.library.list());
  }, []);

  useEffect(() => { load(); }, [load]);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setScanWarnings([]);
    try {
      const { addons: scanned, warnings } = await bridge.library.scan();
      setAddons(scanned);
      setScanWarnings(warnings ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  const classifyWithAi = useCallback(async () => {
    setAiClassifying(true);
    setAiError(null);
    setAiMessage(null);
    try {
      const result = await bridge.ai.classifyUnresolved();
      setAddons(result.addons);
      if (result.errorMessage) {
        setAiError(result.errorMessage);
      } else {
        const total = result.classifiedCount + result.failedCount;
        setAiMessage(total === 0
          ? "Nothing needed AI classification — every addon is already resolved."
          : `Classified ${result.appliedCount} of ${total} addon${total === 1 ? '' : 's'} with AI.`);
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiClassifying(false);
    }
  }, []);

  const confirm = useCallback(async (id, patch) => {
    const updated = await bridge.addon.confirmMatch(id, patch);
    setAddons(prev => prev.map(a => (a.id === id ? updated : a)));
    setEditingId(null);
  }, []);

  const toggleAlwaysActive = useCallback(async (id, current) => {
    const updated = await bridge.addon.setAlwaysActive(id, !current);
    setAddons(prev => prev.map(a => (a.id === id ? updated : a)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return addons.filter(a => {
      if (typeFilter !== 'ALL' && a.contentType !== typeFilter) return false;
      if (regionFilter !== 'ALL' && a.region !== regionFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.folderName.toLowerCase().includes(q) ||
        (a.matchedIcao ?? '').toLowerCase().includes(q) ||
        (a.categoryPath ?? '').toLowerCase().includes(q)
      );
    });
  }, [addons, query, typeFilter, regionFilter]);

  const unresolvedCount = useMemo(() => addons.filter(needsAiClassification).length, [addons]);

  const unconfirmed = filtered.filter(a => !a.confirmed);
  const confirmed = filtered.filter(a => a.confirmed);

  const counts = useMemo(() => {
    const c = { SCENERY: 0, LIVERY: 0, AIRCRAFT: 0, OTHER: 0 };
    for (const a of addons) c[a.contentType] = (c[a.contentType] ?? 0) + 1;
    return c;
  }, [addons]);

  const regionsPresent = useMemo(() => {
    const set = new Set(addons.map(a => a.region).filter(Boolean));
    return KNOWN_REGIONS.filter(r => set.has(r));
  }, [addons]);

  const conflictGroups = useMemo(() => {
    const byName = new Map();
    for (const a of addons) {
      if (!a.nameConflict) continue;
      if (!byName.has(a.folderName)) byName.set(a.folderName, []);
      byName.get(a.folderName).push(a);
    }
    return [...byName.entries()];
  }, [addons]);

  return (
    <motion.div className="view view--wide" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="section__header">
        <h2>{t('addonLibrary')}</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn--ghost" onClick={() => setShowVault(v => !v)}>
            <FolderSearch size={14} /> Where do my files live?
          </button>
          {addons.length > 0 && (
            <button className="btn btn--ghost" onClick={() => setShowMap(v => !v)}>
              <MapPin size={14} /> {showMap ? 'Hide map' : 'View on map'}
            </button>
          )}
          {addons.length > 0 && (
            <button
              className="btn btn--ghost"
              onClick={classifyWithAi}
              disabled={aiClassifying || unresolvedCount === 0}
              title={unresolvedCount === 0 ? 'Every addon is already resolved' : `${unresolvedCount} addon(s) could use AI help`}
            >
              <Sparkles size={14} className={aiClassifying ? 'spin' : ''} />
              {aiClassifying ? 'Classifying…' : `Classify with AI${unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}`}
            </button>
          )}
          <button className="btn btn--ghost" onClick={scan} disabled={scanning}>
            <RefreshCw size={14} className={scanning ? 'spin' : ''} />
            {scanning ? t('scanning') : t('rescanCommunity')}
          </button>
        </div>
      </div>

      {aiError && <div className="banner banner--error">{aiError}</div>}
      {aiMessage && <div className="banner banner--amber">{aiMessage}</div>}

      <AnimatePresence>
        {showVault && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <VaultDiagram communityPath={settings.communityPath} vaultPath={settings.vaultPath} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: 'var(--space-4)' }}
          >
            <SceneryMap addons={addons} />
          </motion.div>
        )}
      </AnimatePresence>

      {addons.length === 0 && !scanning ? (
        <div className="library-empty glass notched">
          <Boxes size={36} color="var(--text-faint)" />
          <h3 className="library-empty__title">No addons scanned yet</h3>
          <p>
            Run a scan to find everything already in your Community folder — FlightSync will
            move it into a hidden vault and link it right back, so MSFS won't notice a thing.
          </p>
          <button className="btn btn--primary" onClick={scan} disabled={scanning}>
            <RefreshCw size={14} /> {t('rescanCommunity')}
          </button>
        </div>
      ) : (
        <>
      {addons.length > 0 && (
        <div className="type-legend">
          {Object.entries(CONTENT_TYPE_COLORS).map(([type, c]) => (
            <div key={type} className="type-legend__item">
              <span className="type-legend__dot" style={{ background: `var(${c.var})` }} />
              <span className="type-legend__label">{c.label}</span>
              <span className="type-legend__count">{counts[type] ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <div className="search-bar">
          <Search size={15} className="search-bar__icon" />
          <input
            className="search-bar__input"
            placeholder={t('filterPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="chip-row">
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              className={`filter-chip ${typeFilter === t ? 'filter-chip--active' : ''}`}
              style={typeFilter === t && t !== 'ALL' ? { borderColor: cssColor(t), color: cssColor(t) } : undefined}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'ALL' ? 'All' : colorFor(t).label}
            </button>
          ))}
        </div>

        {regionsPresent.length > 0 && (typeFilter === 'ALL' || typeFilter === 'SCENERY') && (
          <select className="region-select" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="ALL">{t('allRegions')}</option>
            {regionsPresent.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {conflictGroups.length > 0 && (
        <details className="banner banner--error">
          <summary style={{ cursor: 'pointer' }}>
            {conflictGroups.length} folder-name conflict{conflictGroups.length === 1 ? '' : 's'} — excluded from auto-sync until renamed
          </summary>
          <div className="warning-groups">
            <p className="warning-group__explain">MSFS can only link one folder per name — rename one of each pair in the vault, then rescan:</p>
            <ul className="warning-group__list">
              {conflictGroups.map(([folderName, group]) => (
                <li key={folderName}>
                  <span className="warning-group__path">{folderName}</span>
                  <span className="warning-group__reason"> — {group.map(a => a.categoryPath || '(root)').join(' vs. ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {scanWarnings.length > 0 && (
        <details className="banner banner--amber">
          <summary style={{ cursor: 'pointer' }}>
            {scanWarnings.length} folder{scanWarnings.length === 1 ? '' : 's'} couldn't be fully scanned — click to see why
          </summary>
          <div className="warning-groups">
            {groupWarnings(scanWarnings).map(([code, items]) => (
              <div key={code} className="warning-group">
                <p className="warning-group__explain">{WARNING_EXPLAIN[code] ?? 'Issue while scanning:'}</p>
                <ul className="warning-group__list">
                  {items.map((w, i) => (
                    <li key={i}>
                      <span className="warning-group__path">{w.path}</span>
                      {w.message && <span className="warning-group__reason"> — {w.message}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {unconfirmed.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h3>{t('needsConfirmation')}</h3>
            <span className="section__count">{unconfirmed.length}</span>
          </div>
          <div className="manifest">
            <AnimatePresence initial={false}>
              {unconfirmed.map(addon => (
                <motion.div
                  key={addon.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="confirm-row confirm-row--stacked"
                  style={{ borderLeftColor: 'var(--amber-text)' }}
                >
                  <div className="confirm-row__top">
                    <span className="led led--amber" />
                    <div className="confirm-row__info">
                      <span className="confirm-row__title">{addon.title}</span>
                      <span className="confirm-row__folder">
                        {addon.categoryPath ? `${addon.categoryPath}/${addon.folderName}` : addon.folderName}
                        {addon.candidateIcaos.length > 1 && (
                          <span className="confirm-row__candidates"> · {addon.candidateIcaos.join(' / ')}</span>
                        )}
                      </span>
                    </div>
                    {editingId !== addon.id && (
                      <button className="btn btn--ghost btn--small" onClick={() => setEditingId(addon.id)}>
                        {t('confirmManually')}
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {editingId === addon.id && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <ConfirmForm
                          addon={addon}
                          onSave={(patch) => confirm(addon.id, patch)}
                          onCancel={() => setEditingId(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__header">
          <h3>{t('confirmed')}</h3>
          <span className="section__count">{confirmed.length}</span>
        </div>
        <div className="manifest">
          <AnimatePresence initial={false}>
            {confirmed.map(addon => {
              const color = colorFor(addon.contentType);
              const colorCss = `var(${color.var})`;
              return (
                <motion.div
                  key={addon.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="confirm-row"
                  style={{ borderLeftColor: addon.nameConflict ? 'var(--red-text)' : colorCss }}
                >
                  <span className={`led led--${addon.nameConflict ? 'red' : 'green'}`} />
                  <div className="confirm-row__info">
                    <span className="confirm-row__title">{addon.title}</span>
                    <span className="confirm-row__folder">
                      {addon.matchedIcao || addon.matchedAircraftType}
                      {addon.matchedAirline ? ` · ${addon.matchedAirline}` : ''}
                      {addon.region ? ` · ${addon.region}` : ''}
                      {addon.categoryPath && ` · ${addon.categoryPath}`}
                    </span>
                  </div>
                  {addon.nameConflict && <span className="manifest__type" style={{ color: 'var(--red-text)' }}>CONFLICT</span>}
                  <span className="manifest__type" style={{ color: colorCss }}>{color.label}</span>
                  <label className="always-active">
                    <input
                      type="checkbox"
                      checked={addon.alwaysActive}
                      onChange={() => toggleAlwaysActive(addon.id, addon.alwaysActive)}
                    />
                    {t('alwaysActive')}
                  </label>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {confirmed.length === 0 && <div className="manifest__empty">No confirmed addons yet.</div>}
        </div>
      </section>
        </>
      )}
    </motion.div>
  );
}
