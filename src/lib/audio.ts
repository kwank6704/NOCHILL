'use client';

import type { ItemKind } from './api';

/**
 * Every sound in the app is synthesized with the Web Audio API — no audio files.
 * Ceramic = noise crunch + inharmonic sine "pings"; paper = amplitude-chopped
 * band-passed noise; the shredder = detuned saws + LFO-gated grinding noise.
 */

export type Loop = { update(level: number): void; stop(): void };

const MUTE_KEY = 'nochill:muted';
const rand = (a: number, b: number) => a + Math.random() * (b - a);

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listeners = new Set<(muted: boolean) => void>();
  muted = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {}
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.85;
      master.connect(comp).connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {}
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.02);
    this.listeners.forEach((fn) => fn(muted));
  }

  subscribe(fn: (muted: boolean) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ---------- building blocks ----------

  private ready() {
    const ctx = this.unlock();
    if (!ctx || !this.master || !this.noise) return null;
    return { ctx, out: this.master, noise: this.noise };
  }

  private burst(
    t: number,
    dur: number,
    filter: BiquadFilterType,
    freq: number,
    gain: number,
    q = 1,
    attack = 0.002,
  ) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out, noise } = r;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, rand(0, 1.5));
    src.stop(t + attack + dur + 0.05);
  }

  private tone(
    t: number,
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    freqEnd?: number,
    attack = 0.003,
  ) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  /** Inharmonic bell partials — the "tink" of ceramic and glass. */
  private ping(t: number, freq: number, dur: number, gain: number) {
    this.tone(t, freq, dur, gain, 'sine', freq * 0.985, 0.001);
    this.tone(t, freq * 2.76, dur * 0.5, gain * 0.35, 'sine', undefined, 0.001);
  }

  // ---------- breathing ----------

  inhaleLoop(): Loop | null {
    const r = this.ready();
    if (!r) return null;
    const { ctx, out, noise } = r;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 500;
    band.Q.value = 0.9;
    const air = ctx.createGain();
    air.gain.setValueAtTime(0.0001, now);
    air.gain.linearRampToValueAtTime(0.06, now + 0.25);
    src.connect(band).connect(air).connect(out);

    // Rubber-balloon squeak with a vibrato that gets more nervous under pressure.
    const squeak = ctx.createOscillator();
    squeak.type = 'triangle';
    squeak.frequency.value = 180;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 4;
    lfo.connect(lfoDepth).connect(squeak.frequency);
    const sq = ctx.createGain();
    sq.gain.value = 0;
    squeak.connect(sq).connect(out);

    src.start();
    squeak.start();
    lfo.start();

    return {
      update(p) {
        const t = ctx.currentTime;
        band.frequency.setTargetAtTime(500 + 2400 * p, t, 0.08);
        air.gain.setTargetAtTime(0.05 + 0.13 * p, t, 0.1);
        squeak.frequency.setTargetAtTime(170 + 560 * p, t, 0.08);
        sq.gain.setTargetAtTime(p > 0.35 ? (p - 0.35) * 0.075 : 0, t, 0.1);
        lfo.frequency.setTargetAtTime(5 + 22 * p, t, 0.1);
        lfoDepth.gain.setTargetAtTime(4 + 34 * p, t, 0.1);
      },
      stop() {
        const t = ctx.currentTime;
        air.gain.setTargetAtTime(0.0001, t, 0.04);
        sq.gain.setTargetAtTime(0.0001, t, 0.03);
        src.stop(t + 0.25);
        squeak.stop(t + 0.25);
        lfo.stop(t + 0.25);
      },
    };
  }

  pop() {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.09, 'highpass', 900, 1.1, 0.7, 0.001);
    this.burst(t, 0.3, 'lowpass', 1400, 0.7, 0.5, 0.002);
    this.tone(t, 130, 0.25, 0.8, 'sine', 38);
  }

  psst(level = 1) {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.16 + level * 0.1, 'highpass', 2600, 0.14 + level * 0.08, 0.6, 0.02);
  }

  whoosh(intensity = 1) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out, noise } = r;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28 * intensity, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(f).connect(g).connect(out);
    src.start(t, rand(0, 1.5));
    src.stop(t + 0.35);
  }

  // ---------- destruction ----------

  shatter(kind: ItemKind, intensity = 1) {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    const i = Math.min(1.5, Math.max(0.4, intensity));

    switch (kind) {
      case 'plate':
      case 'mug': {
        const low = kind === 'mug';
        this.tone(t, low ? 110 : 150, 0.16, 0.75 * i, 'sine', 45);
        this.burst(t, 0.2, 'highpass', low ? 1300 : 2000, 0.9 * i, 0.8, 0.001);
        this.burst(t, 0.07, 'bandpass', 900, 0.6 * i, 1.2, 0.001);
        const pings = Math.round(9 + i * 6);
        for (let k = 0; k < pings; k++) {
          this.ping(t + rand(0, 0.16), low ? rand(1300, 4600) : rand(2300, 7600), rand(0.06, 0.34), rand(0.05, 0.15) * i);
        }
        // Bits skittering on the floor afterwards.
        for (let k = 0; k < 6; k++) {
          const tt = t + rand(0.22, 0.8);
          this.ping(tt, rand(3000, 8000), rand(0.03, 0.09), rand(0.02, 0.06));
          this.burst(tt, 0.03, 'highpass', 4000, 0.08, 1, 0.001);
        }
        if (low) this.burst(t + 0.02, 0.35, 'lowpass', 900, 0.35 * i, 0.7, 0.01); // coffee splash
        break;
      }
      case 'keyboard': {
        this.tone(t, 95, 0.22, 0.95 * i, 'sine', 40);
        this.burst(t, 0.1, 'bandpass', 1100, 0.9 * i, 1.1, 0.001);
        for (let k = 0; k < 22; k++) {
          this.burst(t + rand(0, 0.42), 0.012, 'bandpass', rand(2600, 5200), rand(0.25, 0.6), 5, 0.0005);
        }
        this.burst(t + 0.05, 0.25, 'highpass', 2500, 0.25, 0.8, 0.01);
        break;
      }
      case 'phone': {
        this.tone(t, 180, 0.12, 0.6 * i, 'sine', 60);
        this.burst(t, 0.22, 'highpass', 3200, 1.0 * i, 0.9, 0.001);
        for (let k = 0; k < 14; k++) this.ping(t + rand(0, 0.2), rand(4000, 9500), rand(0.05, 0.25), rand(0.04, 0.12));
        this.tone(t + 0.02, 1500, 0.3, 0.12, 'sawtooth', 70); // dying electronics
        this.tone(t + 0.05, 2100, 0.2, 0.05, 'square', 400);
        break;
      }
      case 'docs':
        this.tear(t, i);
        break;
    }
  }

  private tear(t: number, i = 1) {
    const r = this.ready();
    if (!r) return;
    const { ctx, out, noise } = r;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // Paper tears in tiny irregular fibres — chop the envelope randomly.
    const steps = 34;
    for (let k = 0; k < steps; k++) {
      g.gain.setValueAtTime(rand(0.05, 0.55) * i * (1 - k / steps / 1.4), t + k * 0.014);
    }
    g.gain.setValueAtTime(0, t + steps * 0.014);
    src.connect(f).connect(g).connect(out);
    src.start(t, rand(0, 1.5));
    src.stop(t + steps * 0.014 + 0.05);
    this.tone(t, 120, 0.1, 0.35 * i, 'sine', 60);
  }

  // ---------- shredder ----------

  shredderLoop(): Loop | null {
    const r = this.ready();
    if (!r) return null;
    const { ctx, out, noise } = r;
    const now = ctx.currentTime;

    const motorOut = ctx.createGain();
    motorOut.gain.setValueAtTime(0.0001, now);
    motorOut.gain.linearRampToValueAtTime(0.22, now + 0.15);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 360;
    const m1 = ctx.createOscillator();
    m1.type = 'sawtooth';
    m1.frequency.setValueAtTime(30, now);
    m1.frequency.exponentialRampToValueAtTime(58, now + 0.25);
    const m2 = ctx.createOscillator();
    m2.type = 'square';
    m2.frequency.setValueAtTime(60, now);
    m2.frequency.exponentialRampToValueAtTime(117, now + 0.25);
    const m2g = ctx.createGain();
    m2g.gain.value = 0.35;
    m1.connect(lp);
    m2.connect(m2g).connect(lp);
    lp.connect(motorOut).connect(out);

    // Grinding: noise gated by a fast LFO = teeth biting through paper.
    const grindSrc = ctx.createBufferSource();
    grindSrc.buffer = noise;
    grindSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.1;
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 21;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.45;
    lfo.connect(lfoAmt).connect(gate.gain);
    const grind = ctx.createGain();
    grind.gain.value = 0;
    grindSrc.connect(bp).connect(gate).connect(grind).connect(out);

    [m1, m2, grindSrc, lfo].forEach((n) => n.start(now));

    return {
      update(load) {
        const t = ctx.currentTime;
        grind.gain.setTargetAtTime(0.05 + 0.5 * load, t, 0.04);
        lp.frequency.setTargetAtTime(320 + 600 * load, t, 0.05);
        lfo.frequency.setTargetAtTime(16 + 14 * load, t, 0.05);
      },
      stop() {
        const t = ctx.currentTime;
        m1.frequency.setTargetAtTime(18, t, 0.15);
        m2.frequency.setTargetAtTime(36, t, 0.15);
        motorOut.gain.setTargetAtTime(0.0001, t + 0.1, 0.12);
        grind.gain.setTargetAtTime(0.0001, t, 0.03);
        [m1, m2, grindSrc, lfo].forEach((n) => n.stop(t + 0.7));
      },
    };
  }

  // ---------- keyboard mash ----------

  /** One mechanical switch: click (bandpassed noise) + bottom-out thock. Heat makes it harsher. */
  keyClick(heat = 0) {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.018, 'bandpass', rand(2800, 4200) + heat * 1500, 0.35 + heat * 0.25, 4, 0.0005);
    this.tone(t + 0.004, rand(170, 230) - heat * 40, 0.05, 0.22 + heat * 0.2, 'triangle', 90, 0.001);
    if (heat > 0.6 && Math.random() < 0.3) this.burst(t + 0.01, 0.04, 'highpass', 5000, 0.12, 1, 0.001); // desk rattle
  }

  /** A keycap snapping off its switch. */
  keycapPop() {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(t, 0.03, 'bandpass', 1800, 0.5, 3, 0.0005);
    this.tone(t, 900, 0.08, 0.12, 'square', 400, 0.001);
    this.ping(t + rand(0.25, 0.45), rand(2500, 4000), 0.05, 0.05); // lands somewhere
  }

  // ---------- UI ----------

  /** Sad little "wah-wah" when the coach roasts you. */
  bonk() {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 466, 0.13, 0.12, 'triangle');
    this.tone(t + 0.15, 440, 0.32, 0.12, 'triangle', 330);
  }

  tick() {
    const ctx = this.unlock();
    if (!ctx) return;
    this.burst(ctx.currentTime, 0.02, 'bandpass', 3500, 0.15, 3, 0.0005);
  }
}

export const sfx = new Sfx();
