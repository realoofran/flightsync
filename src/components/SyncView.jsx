import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Boxes, AlertTriangle, Link2, Info, Rocket, X, Layers, Save, Trash2 } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';
import { useSyncState } from '../lib/SyncStateContext.jsx';
import { relativeTime } from '../lib/timeFormat.js';
import FlightStrip from './FlightStrip.jsx';
import ManifestList from './ManifestList.jsx';
import RouteMap from './RouteMap.jsx';
import OfpPanel from './OfpPanel.jsx';
import ManualRouteForm from './ManualRouteForm.jsx';

const bridge = getBridge();

export default function SyncView() {
  const { t } = useAppSettings();
  const {
    plan, loadingPlan, manualEntry, preview, applying, applyResult, error, lastSync, msfsLaunched, activeLoadoutName,
    setManualEntry, pullFromSimbrief, pullFromVatsim, submitManualPlan, applySync, dismissMsfsLaunched,
    applyLoadout, saveAsLoadout,
  } = useSyncState();

  const [loadouts, setLoadouts] = useState([]);
  const refreshLoadouts = useCallback(() => {
    bridge.library.listLoadouts().then(setLoadouts);
  }, []);
  useEffect(() => { refreshLoadouts(); }, [refreshLoadouts]);

  const deleteLoadout = async (id) => {
    await bridge.library.deleteLoadout(id);
    refreshLoadouts();
  };

  // The refresh icon on a loaded plan should re-pull from wherever that
  // plan actually came from — previously this always re-pulled from
  // SimBrief even when the active plan was manually entered, a latent bug
  // that got more obviously wrong once a third source (VATSIM) existed.
  // Manual entries have no "re-fetch" equivalent, so no refresh handler is
  // offered for those — FlightStrip hides the button when onRefresh is null.
  const refreshHandlers = { simbrief: pullFromSimbrief, vatsim: pullFromVatsim };
  const onRefresh = plan?.source ? refreshHandlers[plan.source] ?? null : pullFromSimbrief;
  const [libraryStats, setLibraryStats] = useState(null);

  useEffect(() => {
    bridge.library.list().then(addons => {
      setLibraryStats({
        total: addons.length,
        pending: addons.filter(a => !a.confirmed).length,
        active: addons.filter(a => a.alwaysActive).length,
      });
    });
  }, []);

  const totalChanges = (preview?.syncPlan.toLink.length ?? 0) + (preview?.syncPlan.toUnlink.length ?? 0);

  return (
    <div className="view view--wide">
      <AnimatePresence>
        {msfsLaunched && (
          <motion.div
            className="banner banner--green msfs-launched-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Rocket size={15} />
            <span>{totalChanges > 0 ? t('msfsLaunchedWithChanges', { count: totalChanges }) : t('msfsLaunchedNoChanges')}</span>
            <button className="banner__dismiss" onClick={dismissMsfsLaunched} aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <FlightStrip
        plan={plan}
        loading={loadingPlan}
        onRefresh={onRefresh}
        onPullFromSimbrief={pullFromSimbrief}
        onPullFromVatsim={pullFromVatsim}
        onManualEntry={!plan && !manualEntry ? () => setManualEntry(true) : null}
        addonCount={(preview?.syncPlan.toLink.length ?? 0) + (preview?.syncPlan.unchanged.length ?? 0)}
      />

      {loadouts.length > 0 && (
        <motion.div className="loadouts-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className="loadouts-row__label"><Layers size={13} />{t('loadoutsLabel')}</span>
          {loadouts.map((l) => (
            <span className="loadout-chip" key={l.id}>
              <button
                className="loadout-chip__apply"
                onClick={() => applyLoadout(l.id)}
                title={t('loadoutApplyTitle', { name: l.name, count: l.addonIds.length })}
              >
                {l.name}
              </button>
              <button
                className="loadout-chip__delete"
                onClick={() => deleteLoadout(l.id)}
                title={t('loadoutDeleteTitle', { name: l.name })}
                aria-label={t('loadoutDeleteAria', { name: l.name })}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {manualEntry && !plan && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <ManualRouteForm onSubmit={submitManualPlan} onCancel={() => setManualEntry(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {!plan && libraryStats && (
        <motion.div className="quick-stats" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="quick-stat">
            <Boxes size={16} />
            <span className="quick-stat__value">{libraryStats.total}</span>
            <span className="quick-stat__label">{t('addonsInLibrary')}</span>
          </div>
          <div className="quick-stat">
            <Link2 size={16} />
            <span className="quick-stat__value">{libraryStats.active}</span>
            <span className="quick-stat__label">{t('alwaysActiveStat')}</span>
          </div>
          {libraryStats.pending > 0 && (
            <div className="quick-stat quick-stat--amber">
              <AlertTriangle size={16} />
              <span className="quick-stat__value">{libraryStats.pending}</span>
              <span className="quick-stat__label">{t('needConfirmationStat')}</span>
            </div>
          )}
        </motion.div>
      )}

      {lastSync && !plan && (
        <motion.div className="last-sync" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {t('lastSyncSummary', { time: relativeTime(lastSync.timestamp), linked: lastSync.linkedCount, unlinked: lastSync.unlinkedCount })}
          {lastSync.errorCount > 0 && t('lastSyncErrors', { count: lastSync.errorCount })}
        </motion.div>
      )}

      {!plan && !lastSync && (
        <motion.div className="info-callout" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Info size={15} />
          <div>
            <strong>{t('howSyncingWorksTitle')}</strong> {t('howSyncingWorksBody')}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {plan && (
          <motion.div
            className="sync-grid"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <RouteMap plan={plan} />
            <OfpPanel ofp={plan.ofp} origin={plan.origin} destination={plan.destination} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div className="banner banner--error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.div>
        )}
        {preview?.pendingConfirmation?.length > 0 && (
          <motion.div className="banner banner--amber" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {t('pendingConfirmationBanner', { count: preview.pendingConfirmation.length })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <section className="section">
              <div className="section__header">
                <h2>{t('syncPlan')}</h2>
                {activeLoadoutName && <span className="tag tag--muted">{t('loadoutTagPrefix')} · {activeLoadoutName}</span>}
                <span className="section__count">{totalChanges} change{totalChanges === 1 ? '' : 's'}</span>
              </div>

              {totalChanges === 0 && (
                <p className="sync-plan__reassure">
                  {t('syncReassure', {
                    confirmedBelow: preview.syncPlan.unchanged.length > 0
                      ? t('syncReassureConfirmedBelow', { count: preview.syncPlan.unchanged.length })
                      : '',
                  })}
                </p>
              )}
              {preview.syncPlan.toLink.length > 0 && (
                <ManifestList addons={preview.syncPlan.toLink} status="link" />
              )}
              {preview.syncPlan.toUnlink.length > 0 && (
                <ManifestList addons={preview.syncPlan.toUnlink} status="unlink" />
              )}
              {preview.syncPlan.unchanged.length > 0 && (
                <ManifestList addons={preview.syncPlan.unchanged} status="unchanged" />
              )}
            </section>

            <SaveLoadoutControl saveAsLoadout={saveAsLoadout} onSaved={refreshLoadouts} />

            <motion.button
              className="btn btn--primary btn--full"
              onClick={applySync}
              disabled={applying || totalChanges === 0}
              whileTap={{ scale: 0.98 }}
            >
              {applying ? t('syncing') : totalChanges === 0 ? t('alreadySynced') : `${t('applySync')} (${totalChanges})`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {applyResult && (
          <motion.div className="banner banner--green" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            {t('applyResultSummary', { linked: applyResult.linked.length, unlinked: applyResult.unlinked.length })}
            {applyResult.errors.length > 0 && t('applyResultErrors', { count: applyResult.errors.length })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * "Save this exact addon set as a loadout" — the only way loadouts get
 * created (see saveAsLoadout in SyncStateContext.jsx): no separate
 * addon-picker UI, just naming whatever the current preview would leave
 * active. Kept local to this file since it's single-use and its state
 * (open/name/saving/error) is entirely about this one inline form.
 */
function SaveLoadoutControl({ saveAsLoadout, onSaved }) {
  const { t } = useAppSettings();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (!open) {
    return (
      <button className="btn btn--ghost btn--small loadout-save-toggle" onClick={() => setOpen(true)}>
        <Save size={13} /> {t('saveAsLoadoutButton')}
      </button>
    );
  }

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveAsLoadout(name);
      setOpen(false);
      setName('');
      onSaved();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="loadout-save-form">
      <input
        autoFocus
        value={name}
        placeholder={t('loadoutNamePlaceholder')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button className="btn btn--primary btn--small" onClick={submit} disabled={saving || !name.trim()}>
        {saving ? t('savingEllipsis') : t('save')}
      </button>
      <button className="btn btn--ghost btn--small" onClick={() => { setOpen(false); setSaveError(null); }}>
        {t('cancel')}
      </button>
      {saveError && <p className="loadout-save-form__error">{saveError}</p>}
    </div>
  );
}
