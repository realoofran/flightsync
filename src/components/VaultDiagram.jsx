import { FolderOpen, Link2, ExternalLink, FolderCog } from 'lucide-react';
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
  const { updateSettings } = useAppSettings();
  if (!communityPath) return null;

  const openFolder = (path) => bridge.shell.openFolder(path);

  const chooseVault = async () => {
    const folder = await bridge.dialog.pickFolder('Choose where your addon files should actually live');
    if (folder) await updateSettings({ vaultPath: folder });
  };

  return (
    <div className="vault-diagram">
      <div className="vault-diagram__box">
        <FolderOpen size={18} color="var(--cyan)" />
        <div className="vault-diagram__box-text">
          <span className="vault-diagram__box-label">COMMUNITY (what MSFS sees)</span>
          <span className="vault-diagram__box-path">{communityPath}</span>
        </div>
        <button className="btn btn--ghost btn--small" onClick={() => openFolder(communityPath)}>
          <ExternalLink size={12} /> Open in Explorer
        </button>
      </div>

      <div className="vault-diagram__link">
        <Link2 size={16} color="var(--green)" />
        <span>links point here</span>
      </div>

      <div className="vault-diagram__box">
        <FolderOpen size={18} color="var(--green)" />
        <div className="vault-diagram__box-text">
          <span className="vault-diagram__box-label">VAULT (where your files actually live)</span>
          <span className="vault-diagram__box-path">{vaultPath || 'Set your Community folder first'}</span>
        </div>
        <button className="btn btn--ghost btn--small" onClick={() => openFolder(vaultPath)} disabled={!vaultPath}>
          <ExternalLink size={12} /> Open in Explorer
        </button>
        <button className="btn btn--ghost btn--small" onClick={chooseVault}>
          <FolderCog size={12} /> Change
        </button>
      </div>
      <p className="vault-diagram__hint">
        Defaults to a hidden folder next to Community (fastest — same drive). Only change this if
        you specifically want your addon files somewhere else; already-linked addons won't move
        until your next rescan.
      </p>
    </div>
  );
}
