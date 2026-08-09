// electron/lib/processWatcher.js
//
// Detects MSFS 2024 launching so FlightSync can nudge the user (or, if
// they've opted in, auto-sync) right when it matters most — the moment
// before they'd otherwise fly with the wrong addons linked. Windows-only,
// matching the rest of this app's Windows-only scope.
//
// Process name confirmed against real reports of the executable
// (FlightSimulator2024.exe) rather than guessed.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MSFS_PROCESS_NAME = 'FlightSimulator2024.exe';

/** @returns {Promise<boolean>} */
export async function isMsfsRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI', `IMAGENAME eq ${MSFS_PROCESS_NAME}`,
      '/NH', '/FO', 'CSV',
    ]);
    return stdout.toUpperCase().includes(MSFS_PROCESS_NAME.toUpperCase());
  } catch {
    return false; // tasklist itself failing shouldn't crash anything watching this
  }
}
