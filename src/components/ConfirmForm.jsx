import { useState } from 'react';
import { KNOWN_AIRCRAFT_TYPES, KNOWN_AIRLINES } from '../lib/knownCodes.js';
import { KNOWN_REGIONS } from '../lib/regions.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';

const CONTENT_TYPES = ['SCENERY', 'LIVERY', 'AIRCRAFT', 'OTHER'];

/**
 * Inline form for confirming/overriding a single addon's match. Shown when
 * the automatic scan found nothing, found an ambiguous set of candidates,
 * or simply got it wrong (e.g. content_type misread).
 *
 * @param {{ addon: Addon, onSave: (patch: object) => void, onCancel: () => void }} props
 */
export default function ConfirmForm({ addon, onSave, onCancel }) {
  const { t } = useAppSettings();
  const [contentType, setContentType] = useState(addon.contentType);
  const [icao, setIcao] = useState(addon.matchedIcao ?? addon.candidateIcaos[0] ?? '');
  const [aircraftType, setAircraftType] = useState(addon.matchedAircraftType ?? '');
  const [airline, setAirline] = useState(addon.matchedAirline ?? '');
  const [region, setRegion] = useState(addon.region ?? '');

  const save = () => {
    const patch = { contentType };
    if (contentType === 'SCENERY') {
      patch.matchedIcao = icao.toUpperCase().trim();
      patch.region = region || null;
    } else if (contentType === 'LIVERY') {
      patch.matchedAircraftType = aircraftType.toUpperCase().trim();
      patch.matchedAirline = airline.toUpperCase().trim() || null;
    } else if (contentType === 'AIRCRAFT') {
      patch.matchedAircraftType = aircraftType.toUpperCase().trim();
    }
    onSave(patch);
  };

  const canSave =
    contentType === 'OTHER' ||
    (contentType === 'SCENERY' && icao.length === 4) ||
    (contentType === 'LIVERY' && aircraftType.length >= 3) ||
    (contentType === 'AIRCRAFT' && aircraftType.length >= 3);

  return (
    <div className="confirm-form confirm-form--pending">
      <div className="confirm-form__row">
        <label>{t('typeLabel')}</label>
        <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
          {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
        </select>
      </div>

      {contentType === 'SCENERY' && (
        <div className="confirm-form__row">
          <label>{t('airportIcaoLabel')}</label>
          <input
            autoFocus
            value={icao}
            maxLength={4}
            placeholder={t('airportIcaoPlaceholder')}
            onChange={(e) => setIcao(e.target.value.toUpperCase())}
          />
          {addon.candidateIcaos.length > 1 && (
            <div className="confirm-form__quickpicks">
              {addon.candidateIcaos.map(c => (
                <button key={c} type="button" className="chip" onClick={() => setIcao(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {contentType === 'SCENERY' && (
        <div className="confirm-form__row">
          <label>{t('regionLabel')}</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">{t('notSetOption')}</option>
            {KNOWN_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {(contentType === 'LIVERY' || contentType === 'AIRCRAFT') && (
        <div className="confirm-form__row">
          <label>{t('aircraftIcaoTypeLabel')}</label>
          <input
            autoFocus
            list="aircraft-types"
            value={aircraftType}
            placeholder={t('aircraftTypePlaceholder')}
            onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
          />
          <datalist id="aircraft-types">
            {KNOWN_AIRCRAFT_TYPES.map(ac => <option key={ac} value={ac} />)}
          </datalist>
        </div>
      )}

      {contentType === 'LIVERY' && (
        <div className="confirm-form__row">
          <label>{t('airlineIcaoLabel')}</label>
          <input
            list="airlines"
            value={airline}
            placeholder={t('airlineIcaoPlaceholder')}
            onChange={(e) => setAirline(e.target.value.toUpperCase())}
          />
          <datalist id="airlines">
            {KNOWN_AIRLINES.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
      )}

      {contentType === 'OTHER' && (
        <p className="confirm-form__hint">
          {t('otherTypeHint')}
        </p>
      )}

      <div className="confirm-form__actions">
        <button className="btn btn--primary btn--small" onClick={save} disabled={!canSave}>{t('save')}</button>
        <button className="btn btn--ghost btn--small" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
