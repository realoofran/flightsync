import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CornerDownLeft, Boxes, Settings2, PlaneTakeoff, History, RefreshCw, Sun, Moon, Contrast, Download, BarChart3 } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useSyncState } from '../lib/SyncStateContext.jsx';
import { useUpdater } from '../lib/useUpdater.js';
import { colorFor } from '../lib/contentTypeColors.js';
import { fuzzyFilter } from '../lib/fuzzySearch.js';
import './CommandPalette.css';

const bridge = getBridge();

/**
 * Global Ctrl/Cmd+K launcher — jump to any tab, run a common action, or
 * find a specific addon by name/ICAO/type without hunting through Library's
 * own filters. Addon search results just switch to the Library tab (not a
 * pre-filtered search there too) — deliberately scoped simply rather than
 * threading a shared search-query state through another context.
 */
export default function CommandPalette({ open, onClose, setTab }) {
  const { settings, updateSettings } = useAppSettings();
  const { pullFromSimbrief, setManualEntry } = useSyncState();
  const { check: checkForUpdates } = useUpdater();
  const [query, setQuery] = useState('');
  const [addons, setAddons] = useState([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    setQuery('');
    setSelected(0);
    bridge.library.list().then(setAddons);
    // A single requestAnimationFrame isn't reliably enough once Framer
    // Motion's own mount/animation scheduling is in the mix — the input can
    // still not be focusable yet on that frame. A short timeout is the
    // pragmatic fix (imperceptible to a real user, but avoids racing the
    // animation library's own timing).
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      clearTimeout(timer);
      // Standard modal-dialog behavior: give focus back to whatever
      // triggered the palette (the Ctrl+K hint button, or wherever the
      // user was) instead of dropping it to <body> when it closes.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  const go = useCallback((tab) => setTab(tab), [setTab]);

  const commands = useMemo(() => [
    { id: 'nav-sync', label: 'Go to Route Sync', hint: 'Ctrl+1', icon: PlaneTakeoff, run: () => go('sync') },
    { id: 'nav-library', label: 'Go to Library', hint: 'Ctrl+2', icon: Boxes, run: () => go('library') },
    { id: 'nav-history', label: 'Go to History', hint: 'Ctrl+3', icon: History, run: () => go('history') },
    { id: 'nav-insights', label: 'Go to Insights', hint: 'Ctrl+4', icon: BarChart3, run: () => go('insights') },
    { id: 'nav-settings', label: 'Go to Settings', hint: 'Ctrl+5', icon: Settings2, run: () => go('settings') },
    { id: 'pull-simbrief', label: 'Pull from SimBrief', icon: RefreshCw, run: () => { go('sync'); pullFromSimbrief(); } },
    { id: 'manual-entry', label: 'Enter route manually', icon: PlaneTakeoff, run: () => { go('sync'); setManualEntry(true); } },
    { id: 'check-updates', label: 'Check for updates', icon: Download, run: () => { go('settings'); checkForUpdates(); } },
    { id: 'theme-dark', label: 'Switch to Dark theme', icon: Moon, run: () => updateSettings({ theme: 'dark' }) },
    { id: 'theme-light', label: 'Switch to Light theme', icon: Sun, run: () => updateSettings({ theme: 'light' }) },
    { id: 'theme-hc', label: 'Switch to High-Contrast Avionics theme', icon: Contrast, run: () => updateSettings({ theme: 'high-contrast' }) },
  ].filter(c => !(c.id === `theme-${settings.theme === 'high-contrast' ? 'hc' : settings.theme}`)), // don't show "switch to" the theme already active
  [settings.theme, pullFromSimbrief, setManualEntry, checkForUpdates, updateSettings, go]);

  const matchedCommands = useMemo(() => fuzzyFilter(query, commands, (c) => c.label), [query, commands]);
  const matchedAddons = useMemo(
    () => fuzzyFilter(query, addons, (a) => `${a.title} ${a.folderName} ${a.matchedIcao ?? ''} ${a.matchedAircraftType ?? ''}`).slice(0, 6),
    [query, addons],
  );

  const results = useMemo(() => [
    ...matchedCommands.map(c => ({ kind: 'command', ...c })),
    ...matchedAddons.map(a => ({ kind: 'addon', id: `addon-${a.id}`, addon: a, run: () => go('library') })),
  ], [matchedCommands, matchedAddons, go]);

  const execute = useCallback((index) => {
    const result = results[index];
    if (!result) return;
    result.run();
    onClose();
  }, [results, onClose]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); execute(selected); return; }
    // Arrow keys are the intended way to move through results, so Tab has
    // nothing useful to do here — block it from escaping the dialog to
    // whatever's behind the backdrop (standard modal focus-trap behavior)
    // rather than leaving keyboard users able to tab into background content
    // they can't see is still "underneath" an open dialog.
    if (e.key === 'Tab') { e.preventDefault(); }
  }, [results.length, selected, execute, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-palette__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="command-palette glass notched"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-palette__input-row">
              <Search size={16} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                onKeyDown={onKeyDown}
                placeholder="Jump to a tab, run an action, or find an addon…"
                aria-label="Search commands and addons"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-autocomplete="list"
                aria-controls="command-palette-listbox"
                aria-activedescendant={results[selected] ? `command-palette-option-${selected}` : undefined}
              />
            </div>

            <div className="command-palette__results" id="command-palette-listbox" role="listbox">
              {results.length === 0 && <div className="command-palette__empty">No matches.</div>}

              {matchedCommands.length > 0 && <div className="command-palette__group-label">Actions</div>}
              {matchedCommands.map((result, i) => (
                <CommandRow key={result.id} optionId={`command-palette-option-${i}`} result={result} active={i === selected} onClick={() => execute(i)} />
              ))}

              {matchedAddons.length > 0 && <div className="command-palette__group-label">Addons</div>}
              {matchedAddons.map((addon, j) => {
                const i = matchedCommands.length + j;
                const result = { kind: 'addon', id: `addon-${addon.id}`, addon };
                return <CommandRow key={result.id} optionId={`command-palette-option-${i}`} result={result} active={i === selected} onClick={() => execute(i)} />;
              })}
            </div>

            <div className="command-palette__footer">
              <span><CornerDownLeft size={11} /> select</span>
              <span>↑↓ navigate</span>
              <span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CommandRow({ result, active, onClick, optionId }) {
  if (result.kind === 'addon') {
    const color = colorFor(result.addon.contentType);
    return (
      <button
        id={optionId}
        role="option"
        aria-selected={active}
        className={`command-palette__row ${active ? 'command-palette__row--active' : ''}`}
        onClick={onClick}
      >
        <span className="command-palette__row-dot" style={{ background: `var(${color.var})` }} />
        <span className="command-palette__row-label">{result.addon.title}</span>
        <span className="command-palette__row-hint">{result.addon.matchedIcao || result.addon.matchedAircraftType || color.label}</span>
      </button>
    );
  }
  const Icon = result.icon;
  return (
    <button
      id={optionId}
      role="option"
      aria-selected={active}
      className={`command-palette__row ${active ? 'command-palette__row--active' : ''}`}
      onClick={onClick}
    >
      <Icon size={14} />
      <span className="command-palette__row-label">{result.label}</span>
      {result.hint && <span className="command-palette__row-hint">{result.hint}</span>}
    </button>
  );
}
