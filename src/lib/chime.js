// src/lib/chime.js
//
// Tiny synthesized UI chime via the Web Audio API — no audio asset files,
// no new dependency (matches flightCardRenderer.js's "native API instead
// of a library" approach). Opt-in only (settings.soundEnabled, off by
// default — see db.js) and every call is wrapped defensively so a failure
// here can never affect anything else, the same philosophy as the native
// notification helper in electron/main.js.

let ctx = null;

function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function playTone(audioCtx, freq, startTime, duration, gainPeak) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Two short, distinct note sequences so sync-complete and MSFS-launch
// don't sound identical — sync-complete is a calm two-note "done" (C5-E5),
// MSFS launch is a brighter three-note cue (E5-G5-B5) since it's meant to
// grab attention right as the sim is about to read Community.
const CHIME_NOTES = {
  syncComplete: [523.25, 659.25],
  msfsLaunch: [659.25, 783.99, 987.77],
};

/** @param {'syncComplete'|'msfsLaunch'} variant */
export function playChime(variant) {
  try {
    const notes = CHIME_NOTES[variant];
    if (!notes) return;
    const audioCtx = getContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    notes.forEach((freq, i) => playTone(audioCtx, freq, now + i * 0.09, 0.22, 0.15));
  } catch {
    // Non-critical — never let a sound failure affect anything else.
  }
}
