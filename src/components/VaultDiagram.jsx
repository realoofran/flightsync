import { FolderOpen, Link2, ExternalLink, FolderCog, ShieldAlert } from 'lucide-react';
import { getBridge } from '../lib/mockBridge.js';
import { useAppSettings } from '../lib/AppSettingsContext.jsx';

const bridge = getBridge();

/**
 * Makes the vault mechanism concrete instead of asking the user to trust a
 * paragraph of prose: two real, clickable folders with an explicit "linked"
 * relationship between them, matching what's actually on disk. The vault
 * location defaults to auto-derived (recommended — guarantees same-drive,
 * fast migration) but is user-choosable via "Change", since some pilots
 * want their real addon files on a specific drive/folder they control.
 */
export default function VaultDiagram({ communityPath, vaultPath }) {
  const { updateSettings, t } = useAppSettings();
  if (!communityPath) return null;

  const openFolder = (path) => bridge.shell.openFolder(path);

  const chooseVault = async () => {
    const folder = await bridge.dialog.pickFolder('Choose where your addon files should actually live');
    if (folder) await updateSettings({ vaultPath: folder });
  };

  return (
    <div className="vault-diagram">
      <div className="vault-diagram__box">
        <FolderOpen size={18} color="var(--cyan-text)" />
        <div className="vault-diagram__box-text">
          <span className="vault-diagram__box-label">{t('communityBoxLabel')}</span>
          <span className="vault-diagram__box-path">{communityPath}</span>
        </div>
        <button className="btn btn--ghost btn--small" onClick={() => openFolder(communityPath)}>
          <ExternalLink size={12} /> {t('openInExplorer')}
        </button>
      </div>

      <div className="vault-diagram__link">
        <Link2 size={16} color="var(--green-text)" />
        <span>{t('linksPointHere')}</span>
      </div>

      <div className="vault-diagram__box">
        <FolderOpen size={18} color="var(--green-text)" />
        <div className="vault-diagram__box-text">
          <span className="vault-diagram__box-label">{t('vaultBoxLabel')}</span>
          <span className="vault-diagram__box-path">{vaultPath || t('vaultNotSetYet')}</span>
        </div>
        <button className="btn btn--ghost btn--small" onClick={() => openFolder(vaultPath)} disabled={!vaultPath}>
          <ExternalLink size={12} /> {t('openInExplorer')}
        </button>
        <button className="btn btn--ghost btn--small" onClick={chooseVault}>
          <FolderCog size={12} /> {t('changeButton')}
        </button>
      </div>
      <p className="vault-diagram__hint">
        {t('vaultDiagramHint')}
      </p>
      <p className="vault-diagram__warning">
        <ShieldAlert size={13} />
        {t('vaultDiagramWarning')}
      </p>
    </div>
  );
}
