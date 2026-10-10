// Tiny synthesized sound effects (no audio assets) plus haptics on touch devices.
// Everything is best-effort: no AudioContext (jsdom, old browsers) means silence.

export type SoundKind = 'move' | 'capture' | 'special' | 'check' | 'end';

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const HAPTICS: Record<SoundKind, number | number[]> = {
  move: 8,
  capture: [14, 30, 14],
  special: [10, 25, 10, 25, 10],
  check: [20, 40, 20],
  end: [30, 60, 30, 60, 60],
};

export function playSound(kind: SoundKind): void {
  try { navigator.vibrate?.(HAPTICS[kind]); } catch { /* unsupported */ }
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  switch (kind) {
    case 'move':
      tone(ac, 520, t, 0.07, 'triangle', 0.12);
      break;
    case 'capture':
      tone(ac, 300, t, 0.09, 'square', 0.06);
      tone(ac, 180, t + 0.03, 0.12, 'triangle', 0.12);
      break;
    case 'special':
      tone(ac, 392, t, 0.09, 'triangle', 0.1);
      tone(ac, 523, t + 0.07, 0.09, 'triangle', 0.1);
      tone(ac, 659, t + 0.14, 0.14, 'triangle', 0.1);
      break;
    case 'check':
      tone(ac, 880, t, 0.08, 'square', 0.05);
      tone(ac, 660, t + 0.09, 0.12, 'square', 0.05);
      break;
    case 'end':
      tone(ac, 523, t, 0.16, 'triangle', 0.11);
      tone(ac, 659, t + 0.14, 0.16, 'triangle', 0.11);
      tone(ac, 784, t + 0.28, 0.3, 'triangle', 0.12);
      break;
  }
}
