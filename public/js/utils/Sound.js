// One shared AudioContext (browsers cap how many can exist). Synthesised sounds, no assets.
let ctx = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Autoplay policy: audio only starts after a user gesture on the game screen
export function unlockAudioOnGesture() {
  const unlock = () => {
    const c = context();
    if (c && c.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

function tone({ type = 'sine', from, to, start = 0, duration, volume }) {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Short metallic "tock" of the putter face; louder for harder strokes
export function playPuttClick(power) {
  const v = 0.08 + 0.3 * Math.min(1, power);
  tone({ type: 'triangle', from: 1900, to: 900, duration: 0.06, volume: v });
  tone({ type: 'sine', from: 420, to: 300, duration: 0.09, volume: v * 0.6 });
}

// Ball rattling into the plastic cup
export function playCupRattle() {
  [0, 0.09, 0.16, 0.21].forEach((start, i) => {
    tone({ type: 'square', from: 700 - i * 60, to: 380, start, duration: 0.05, volume: 0.09 - i * 0.015 });
  });
  tone({ type: 'sine', from: 260, to: 120, start: 0.24, duration: 0.25, volume: 0.25 });
}

export function playLipOut() {
  tone({ type: 'triangle', from: 900, to: 500, duration: 0.08, volume: 0.12 });
}
