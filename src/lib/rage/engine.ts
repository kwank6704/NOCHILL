import type { ItemKind } from '../api';
import { sfx, type Loop } from '../audio';
import { haptic, HAPTIC } from '../haptics';
import { ITEMS, getSprite, pickItem, type Sprite } from '../items';
import { fracture } from '../shatter';
import { clamp, createLayer, lerp, paintRoom, rand, type Layer } from '../canvas';
import { drawBalloon } from './balloon';

export type RagePhase = 'idle' | 'inhale' | 'armed' | 'done';

export type RageSummary = { holdMs: number; peakPressure: number; items: Partial<Record<ItemKind, number>> };

export type RageCallbacks = {
  onPhase(phase: RagePhase): void;
  /** Fired every frame — write to the DOM directly, don't set React state. */
  onPressure(pressure: number, holdMs: number): void;
  onAmmo(left: number, total: number): void;
  onRelease(holdMs: number, pressure: number, burst: boolean): void;
  onFinish(summary: RageSummary): void;
};

/** Hold time at which pressure reaches 100, and the grace period before the lung pops. */
export const FULL_MS = 8500;
const BURST_GRACE_MS = 1300;
const GRAVITY = 1900;

// rAF timestamps are frame-start times, so `now - holdStart` can be slightly negative
// on the first frame after an input event — clamp to [0, 1].
export const pressureAt = (ms: number) => 100 * (1 - Math.pow(1 - clamp(ms / FULL_MS, 0, 1), 1.7));

type Shard = {
  sprite: Sprite;
  poly: Float32Array;
  cx: number;
  cy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  scale: number;
  floor: number;
  paper: boolean;
  seed: number;
  age: number;
};

type Particle = {
  kind: 'dust' | 'chip' | 'spark' | 'drop' | 'keycap' | 'rubber' | 'steam' | 'flash' | 'air';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  char?: string;
  floor: number;
};

type Flight = {
  kind: ItemKind;
  sprite: Sprite;
  mode: 'wall' | 'drop';
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vx: number;
  vy: number;
  t: number;
  dur: number;
  rot: number;
  spin: number;
  scale: number;
  intensity: number;
  trail: { x: number; y: number; rot: number; scale: number }[];
};

type Held = { kind: ItemKind; sprite: Sprite; x: number; y: number; rot: number; scale: number };

const KEYCAPS = ['Q', 'W', 'E', 'ก', 'ด', 'ห', 'Z', '⌫', 'ESC', 'ฟ', '⇧', 'ไ'];

export class RageEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private floorY = 0;
  private room!: Layer;
  private decals!: Layer;
  private debris!: Layer;
  private raf = 0;
  private last = 0;
  private time = 0;
  private ro: ResizeObserver;

  private phase: RagePhase = 'idle';
  private holdStart = 0;
  private holdMs = 0;
  private pressure = 0;
  private shown = 0; // pressure currently rendered (deflates as you throw)
  private peak = 0;
  private ammo = 0;
  private ammoTotal = 0;
  private tally: Partial<Record<ItemKind, number>> = {};
  private inhale: Loop | null = null;
  private nextBuzz = 0;
  private finishAt = 0;

  private balloonR = 0;
  private balloonV = 0;
  private shake = 0;
  private pointer = { x: 0, y: 0 };
  private samples: { x: number; y: number; t: number }[] = [];
  private held: Held | null = null;
  private flights: Flight[] = [];
  private shards: Shard[] = [];
  private particles: Particle[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: RageCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.inhale?.stop();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  // ---------------------------------------------------------------- layout

  private get balloonPos() {
    return { x: this.w / 2, y: this.floorY * 0.44 };
  }

  private get baseR() {
    return clamp(Math.min(this.w, this.h) * 0.11, 42, 90);
  }

  /** Radius at a given pressure, capped so the balloon never leaves the screen. */
  private radiusAt(pressure: number) {
    const top = this.balloonPos.y - 70; // room above centre, below the nav
    const maxR = Math.min(top / 1.1, this.w * 0.42);
    const growth = Math.min(1.35, maxR / this.baseR - 1);
    return this.baseR * (1 + (Math.max(0, growth) * pressure) / 100);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const old = this.decals ? { decals: this.decals, debris: this.debris } : null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.floorY = this.h * 0.8;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.room = createLayer(this.w, this.h, this.dpr);
    paintRoom(this.room.ctx, this.w, this.h, this.floorY, 'rgba(255,214,80,0.35)');
    this.decals = createLayer(this.w, this.h, this.dpr, old?.decals);
    this.debris = createLayer(this.w, this.h, this.dpr, old?.debris);
    if (!this.balloonR) this.balloonR = this.baseR;
  }

  // ---------------------------------------------------------------- public controls

  getPhase() {
    return this.phase;
  }

  startInhale() {
    if (this.phase === 'done') this.setPhase('idle');
    if (this.phase !== 'idle') return;
    sfx.unlock();
    this.holdStart = performance.now();
    this.holdMs = 0;
    this.pressure = 0;
    this.peak = 0;
    this.tally = {};
    this.inhale = sfx.inhaleLoop();
    this.nextBuzz = 0;
    this.setPhase('inhale');
  }

  endInhale() {
    if (this.phase !== 'inhale') return;
    // Measure from the clock, not the last rendered frame (frames may be throttled).
    this.holdMs = performance.now() - this.holdStart;
    this.pressure = pressureAt(this.holdMs);
    this.peak = Math.max(this.peak, this.pressure);
    this.stopInhaleSound();
    this.cb.onRelease(this.holdMs, this.pressure, false);
    if (this.pressure < 4) {
      this.pressure = 0;
      this.setPhase('idle');
      return;
    }
    this.arm(clamp(Math.round(this.pressure / 8.5), 1, 12));
    sfx.psst(0.6);
  }

  /** Keyboard / accessibility: throw at a random spot on the wall. */
  throwRandom() {
    if (this.phase !== 'armed' || this.ammo <= 0) return;
    const kind = pickItem();
    const x0 = this.w / 2 + rand(-60, 60);
    const y0 = this.h - 40;
    const x1 = rand(this.w * 0.15, this.w * 0.85);
    const y1 = rand(this.floorY * 0.15, this.floorY * 0.8);
    this.launch({ kind, sprite: getSprite(kind, this.dpr), x: x0, y: y0, rot: 0, scale: 1.1 }, (x1 - x0) / 300, (y1 - y0) / 300);
  }

  cleanUp() {
    this.decals.ctx.clearRect(0, 0, this.w, this.h);
    this.debris.ctx.clearRect(0, 0, this.w, this.h);
    this.shards = [];
    this.particles = [];
    sfx.whoosh(0.6);
  }

  // ---------------------------------------------------------------- state machine

  private setPhase(p: RagePhase) {
    this.phase = p;
    this.cb.onPhase(p);
  }

  private arm(total: number) {
    this.ammoTotal = total;
    this.ammo = total;
    this.shown = this.pressure;
    this.setPhase('armed');
    this.cb.onAmmo(this.ammo, this.ammoTotal);
  }

  private stopInhaleSound() {
    this.inhale?.stop();
    this.inhale = null;
  }

  private burst() {
    this.stopInhaleSound();
    const { x, y } = this.balloonPos;
    sfx.pop();
    haptic(HAPTIC.pop);
    this.shake += 22;
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(300, 900);
      this.particles.push(this.particle('rubber', x + Math.cos(a) * this.balloonR, y + Math.sin(a) * this.balloonR, Math.cos(a) * s, Math.sin(a) * s - 200, rand(1.2, 2), rand(6, 14), '#ffb81f'));
    }
    this.flash(x, y, 2.2);
    this.cb.onRelease(this.holdMs, 100, true);
    this.balloonR = this.baseR * 0.4;
    this.pressure = 100;
    this.arm(12);
  }

  // ---------------------------------------------------------------- pointer / throwing

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    const p = this.local(e);
    this.pointer = p;
    if (this.phase !== 'armed' || this.ammo <= 0 || this.held) return;
    this.canvas.setPointerCapture(e.pointerId);
    const kind = pickItem();
    this.held = { kind, sprite: getSprite(kind, this.dpr), x: p.x, y: p.y, rot: 0, scale: 0.2 };
    this.samples = [{ ...p, t: performance.now() }];
    sfx.tick();
    haptic(HAPTIC.tick);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);
    this.pointer = p;
    if (!this.held) return;
    const now = performance.now();
    this.samples.push({ ...p, t: now });
    while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.held) return;
    const p = this.local(e);
    const now = performance.now();
    this.samples.push({ ...p, t: now });
    const first = this.samples.find((s) => now - s.t <= 90) ?? this.samples[0];
    const dt = Math.max(16, now - first.t);
    const vx = (p.x - first.x) / dt;
    const vy = (p.y - first.y) / dt;
    const held = this.held;
    this.held = null;
    this.launch(held, vx, vy);
  };

  /** vx, vy in px/ms. Fast flick → into the wall; slow release → dropped on the floor. */
  private launch(held: Held, vx: number, vy: number) {
    const speed = Math.hypot(vx, vy);
    const base = {
      kind: held.kind,
      sprite: held.sprite,
      x: held.x,
      y: held.y,
      x0: held.x,
      y0: held.y,
      rot: held.rot,
      spin: rand(7, 15) * (Math.random() < 0.5 ? -1 : 1),
      scale: held.scale,
      t: 0,
      trail: [],
    };
    if (speed > 0.45) {
      const dist = clamp(speed * 260, 140, 620);
      const x1 = clamp(held.x + (vx / speed) * dist, 50, this.w - 50);
      const y1 = clamp(held.y + (vy / speed) * dist, 50, this.floorY - 40);
      this.flights.push({
        ...base,
        mode: 'wall',
        x1,
        y1,
        vx: 0,
        vy: 0,
        dur: clamp(430 - speed * 55, 230, 430) / 1000,
        intensity: clamp(0.55 + speed * 0.28, 0.5, 1.5),
      });
      sfx.whoosh(clamp(speed / 2, 0.5, 1.3));
    } else {
      this.flights.push({ ...base, mode: 'drop', x1: 0, y1: 0, vx: vx * 600, vy: vy * 600, dur: 0, intensity: 1, spin: base.spin * 0.4 });
    }

    this.ammo -= 1;
    this.shown = this.peak * (this.ammo / this.ammoTotal);
    this.cb.onAmmo(this.ammo, this.ammoTotal);
    sfx.psst(0.4);
    const { x, y } = this.balloonPos;
    for (let i = 0; i < 8; i++) {
      this.particles.push(this.particle('air', x + rand(-6, 6), y + this.balloonR * 1.1, rand(-120, 120), rand(60, 220), rand(0.4, 0.8), rand(4, 9), 'rgba(255,255,255,0.85)'));
    }
  }

  // ---------------------------------------------------------------- impacts

  private particle(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, max: number, size: number, color: string, extra: Partial<Particle> = {}): Particle {
    return { kind, x, y, vx, vy, life: 0, max, size, color, rot: rand(0, 6.28), vr: rand(-10, 10), floor: this.floorY + rand(8, (this.h - this.floorY) * 0.85), ...extra };
  }

  private flash(x: number, y: number, size = 1) {
    this.particles.push(this.particle('flash', x, y, 0, 0, 0.18, 70 * size, 'rgba(255,240,220,1)'));
  }

  private impact(f: Flight, surface: 'wall' | 'floor') {
    const { kind, sprite } = f;
    const item = ITEMS[kind];
    const i = f.intensity;
    const heavy = kind === 'keyboard' || kind === 'phone';

    sfx.shatter(kind, i);
    haptic(heavy || i > 1.1 ? HAPTIC.bigSmash : HAPTIC.smallSmash);
    this.shake += 9 * i + (heavy ? 7 : 0);
    this.tally[kind] = (this.tally[kind] ?? 0) + 1;
    if (surface === 'wall' && kind !== 'docs') this.flash(f.x, f.y, i);

    // Fracture the sprite itself.
    const paper = item.material === 'paper';
    const rays = paper ? 5 : Math.round(6 + i * 4);
    const frags = fracture(item.w, item.h, rand(-item.w * 0.15, item.w * 0.15), rand(-item.h * 0.15, item.h * 0.15), rays);
    const cos = Math.cos(f.rot);
    const sin = Math.sin(f.rot);
    for (const fr of frags) {
      const lx = fr.cx * f.scale;
      const ly = fr.cy * f.scale;
      const wx = f.x + lx * cos - ly * sin;
      const wy = f.y + lx * sin + ly * cos;
      const d = Math.hypot(lx, ly) || 1;
      const s = rand(140, 520) * i * (paper ? 0.6 : 1);
      let vx = ((wx - f.x) / d) * s;
      let vy = ((wy - f.y) / d) * s;
      if (surface === 'floor') {
        vy = -Math.abs(vy) * 0.8 - rand(150, 420) * i;
        vx *= 1.3;
      }
      this.shards.push({
        sprite,
        poly: fr.poly,
        cx: fr.cx,
        cy: fr.cy,
        x: wx,
        y: wy,
        vx,
        vy,
        rot: f.rot,
        vr: rand(-12, 12),
        scale: f.scale,
        floor: surface === 'floor' ? Math.max(f.y + 10, this.floorY + 6) + rand(-6, 30) : this.floorY + rand(8, (this.h - this.floorY) * 0.8),
        paper,
        seed: rand(0, 100),
        age: 0,
      });
    }

    // Material-specific garnish.
    for (let k = 0; k < 12; k++) {
      const a = rand(0, Math.PI * 2);
      this.particles.push(this.particle('dust', f.x, f.y, Math.cos(a) * rand(30, 140), Math.sin(a) * rand(30, 140), rand(0.5, 1.1), rand(8, 22), paper ? 'rgba(255,255,255,0.55)' : 'rgba(120,150,185,0.22)'));
    }
    if (item.material === 'ceramic') {
      for (let k = 0; k < 18; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(250, 800) * i;
        this.particles.push(this.particle('chip', f.x, f.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.8, 1.6), rand(1.5, 3.5), k % 3 ? '#f4efe6' : '#2757ad'));
      }
    }
    if (kind === 'mug') {
      for (let k = 0; k < 24; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(120, 520);
        this.particles.push(this.particle('drop', f.x, f.y, Math.cos(a) * s, Math.sin(a) * s - 120, rand(0.7, 1.4), rand(2, 5), '#5a3319'));
      }
    }
    if (kind === 'keyboard') {
      for (let k = 0; k < 11; k++) {
        const a = rand(-Math.PI, 0);
        const s = rand(250, 700) * i;
        this.particles.push(this.particle('keycap', f.x + rand(-40, 40), f.y, Math.cos(a) * s, Math.sin(a) * s, rand(1.6, 2.6), rand(11, 15), k === 0 ? '#2f8fdc' : '#50555f', { char: KEYCAPS[k % KEYCAPS.length] }));
      }
    }
    if (kind === 'phone') {
      for (let k = 0; k < 26; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(300, 1000);
        this.particles.push(this.particle('spark', f.x, f.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.7), rand(1, 2.2), k % 2 ? '#ffd23a' : '#ff8a3d'));
      }
    }

    if (surface === 'wall') this.paintDecal(kind, f.x, f.y, i);
    else this.scuff(f.x, Math.max(f.y, this.floorY + 10));
  }

  private paintDecal(kind: ItemKind, x: number, y: number, i: number) {
    const ctx = this.decals.ctx;
    if (kind === 'docs') return;

    if (kind === 'mug') {
      ctx.fillStyle = 'rgba(66,36,18,0.78)';
      for (let k = 0; k < 16; k++) {
        ctx.beginPath();
        ctx.arc(x + rand(-34, 34) * i, y + rand(-26, 26) * i, rand(3, 16) * i, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let k = 0; k < 6; k++) {
        const dx = x + rand(-28, 28);
        const len = rand(30, 120) * i;
        ctx.fillRect(dx - 2, y, rand(2, 4), len);
        ctx.beginPath();
        ctx.arc(dx, y + len, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (kind === 'phone') {
      const scorch = ctx.createRadialGradient(x, y, 2, x, y, 55 * i);
      scorch.addColorStop(0, 'rgba(0,0,0,0.7)');
      scorch.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scorch;
      ctx.fillRect(x - 60 * i, y - 60 * i, 120 * i, 120 * i);
    }

    // Dent.
    const dent = ctx.createRadialGradient(x, y, 1, x, y, 22 * i);
    dent.addColorStop(0, 'rgba(22,58,104,0.35)');
    dent.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dent;
    ctx.beginPath();
    ctx.arc(x, y, 22 * i, 0, Math.PI * 2);
    ctx.fill();

    // Branching cracks.
    const crack = (sx: number, sy: number, ang: number, len: number, width: number, depth: number) => {
      let cx = sx;
      let cy = sy;
      let a = ang;
      let travelled = 0;
      while (travelled < len) {
        const seg = rand(6, 13);
        a += rand(-0.38, 0.38);
        const nx = cx + Math.cos(a) * seg;
        const ny = cy + Math.sin(a) * seg;
        const wdt = width * (1 - travelled / len) + 0.4;
        ctx.strokeStyle = 'rgba(22,40,70,0.6)';
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + 1, cy + 1);
        ctx.lineTo(nx + 1, ny + 1);
        ctx.stroke();
        if (depth < 2 && Math.random() < 0.18) crack(nx, ny, a + rand(-0.9, 0.9), (len - travelled) * 0.55, wdt * 0.7, depth + 1);
        cx = nx;
        cy = ny;
        travelled += seg;
      }
    };
    ctx.lineCap = 'round';
    const n = Math.round(rand(7, 12));
    for (let k = 0; k < n; k++) crack(x, y, (k / n) * Math.PI * 2 + rand(-0.2, 0.2), rand(35, 130) * i, 2.4 * i, 0);
  }

  private scuff(x: number, y: number) {
    const ctx = this.decals.ctx;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 40);
    g.addColorStop(0, 'rgba(22,58,104,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 40, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------- simulation

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1000, 0, 0.033);
    this.last = now;
    this.time += dt;
    if (!this.w) return;

    this.updateBreath(now, dt);
    this.updateHeld(dt);
    this.updateFlights(dt);
    this.updateShards(dt);
    this.updateParticles(dt);

    if (this.phase === 'armed' && this.ammo === 0 && !this.flights.length && !this.held) {
      if (!this.finishAt) this.finishAt = now + 1100;
      if (now >= this.finishAt) {
        this.finishAt = 0;
        this.setPhase('done');
        this.cb.onFinish({ holdMs: this.holdMs, peakPressure: Math.round(this.peak), items: { ...this.tally } });
      }
    }

    this.render();
  };

  private updateBreath(now: number, dt: number) {
    let target = this.baseR;
    if (this.phase === 'inhale') {
      this.holdMs = Math.max(0, now - this.holdStart);
      this.pressure = pressureAt(this.holdMs);
      this.peak = Math.max(this.peak, this.pressure);
      this.inhale?.update(this.pressure / 100);
      if (now >= this.nextBuzz) {
        haptic(Math.round(6 + this.pressure * 0.25));
        this.nextBuzz = now + 420 - this.pressure * 3;
      }
      if (this.pressure > 65 && Math.random() < dt * 14) {
        const { x, y } = this.balloonPos;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.particles.push(this.particle('steam', x + side * this.balloonR * 0.8, y - this.balloonR * 0.5, side * rand(30, 90), rand(-160, -60), rand(0.8, 1.4), rand(10, 18), 'rgba(255,255,255,0.75)'));
      }
      if (this.holdMs > FULL_MS + BURST_GRACE_MS) this.burst();
      this.cb.onPressure(this.pressure, this.holdMs);
      target = this.radiusAt(this.pressure);
    } else if (this.phase === 'armed') {
      this.cb.onPressure(this.shown, this.holdMs);
      target = this.radiusAt(this.shown);
    } else {
      target = this.baseR * (1 + 0.04 * Math.sin(this.time * 1.4));
    }
    // Springy radius so inflate/deflate feels rubbery.
    const k = 120;
    const d = 12;
    this.balloonV += ((target - this.balloonR) * k - this.balloonV * d) * dt;
    this.balloonR += this.balloonV * dt;
  }

  private updateHeld(dt: number) {
    const h = this.held;
    if (!h) return;
    const px = h.x;
    h.x = lerp(h.x, this.pointer.x, Math.min(1, dt * 28));
    h.y = lerp(h.y, this.pointer.y, Math.min(1, dt * 28));
    h.rot = lerp(h.rot, clamp((h.x - px) * 0.03, -0.6, 0.6), Math.min(1, dt * 12));
    h.scale = lerp(h.scale, 1.12, Math.min(1, dt * 14));
  }

  private updateFlights(dt: number) {
    const done: Flight[] = [];
    for (const f of this.flights) {
      f.trail.unshift({ x: f.x, y: f.y, rot: f.rot, scale: f.scale });
      if (f.trail.length > 5) f.trail.pop();
      f.rot += f.spin * dt;
      if (f.mode === 'wall') {
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        const e = 1 - (1 - u) * (1 - u);
        f.x = lerp(f.x0, f.x1, e);
        f.y = lerp(f.y0, f.y1, e) - Math.sin(Math.PI * u) * 50;
        f.scale = lerp(1.12, 0.64, Math.pow(u, 1.3));
        if (u >= 1) {
          this.impact(f, 'wall');
          done.push(f);
        }
      } else {
        f.vy += GRAVITY * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const bottom = f.y + (ITEMS[f.kind].h / 2) * f.scale;
        if (bottom >= Math.max(this.floorY + 24, f.y0 + 30)) {
          f.intensity = clamp(f.vy / 1000, 0.5, 1.3);
          this.impact(f, 'floor');
          done.push(f);
        }
      }
    }
    if (done.length) this.flights = this.flights.filter((f) => !done.includes(f));
  }

  private updateShards(dt: number) {
    const keep: Shard[] = [];
    for (const s of this.shards) {
      s.age += dt;
      if (s.paper) {
        s.vy += 420 * dt;
        s.vx *= 1 - 1.6 * dt;
        s.vy *= 1 - 1.1 * dt;
        s.vx += Math.sin(this.time * 5 + s.seed) * 60 * dt;
        s.rot += Math.sin(this.time * 4 + s.seed) * 2 * dt;
      } else {
        s.vy += GRAVITY * dt;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      if (s.x < 0 || s.x > this.w) {
        s.vx *= -0.4;
        s.x = clamp(s.x, 0, this.w);
      }
      if (s.y >= s.floor && s.vy > 0) {
        s.y = s.floor;
        s.vy *= s.paper ? 0 : -0.28;
        s.vx *= 0.6;
        s.vr *= 0.45;
        if (Math.abs(s.vy) < 45) s.vy = 0;
      }
      if (s.y >= s.floor - 0.5 && s.vy === 0) {
        s.vx *= 1 - Math.min(1, 7 * dt);
        s.vr *= 1 - Math.min(1, 7 * dt);
      }
      const resting = s.vy === 0 && Math.abs(s.vx) < 6;
      if (resting || s.age > 7) this.drawShard(this.debris.ctx, s, 0.9);
      else keep.push(s);
    }
    this.shards = keep;
  }

  private updateParticles(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) {
        if (p.kind === 'keycap' || p.kind === 'drop' || p.kind === 'rubber') this.drawParticle(this.debris.ctx, p, 0.85);
        continue;
      }
      const grav = { dust: -30, chip: GRAVITY, spark: 900, drop: GRAVITY, keycap: GRAVITY, rubber: 1200, steam: -60, flash: 0, air: 0 }[p.kind];
      p.vy += grav * dt;
      if (p.kind === 'dust' || p.kind === 'steam' || p.kind === 'air') {
        p.vx *= 1 - 2.5 * dt;
        p.vy *= 1 - 2.5 * dt;
        p.size += dt * 22;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if ((p.kind === 'chip' || p.kind === 'keycap' || p.kind === 'drop' || p.kind === 'rubber') && p.y > p.floor && p.vy > 0) {
        p.y = p.floor;
        p.vy *= p.kind === 'drop' ? 0 : -0.3;
        p.vx *= 0.5;
        p.vr *= 0.5;
      }
      keep.push(p);
    }
    this.particles = keep;
  }

  // ---------------------------------------------------------------- rendering

  private drawShard(ctx: CanvasRenderingContext2D, s: Shard, alpha = 1) {
    const { poly, sprite } = s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.scale(s.scale, s.scale);
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let k = 2; k < poly.length; k += 2) ctx.lineTo(poly[k], poly[k + 1]);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(sprite.canvas, -s.cx - sprite.w / 2, -s.cy - sprite.h / 2, sprite.w, sprite.h);
    ctx.restore();
    if (!s.paper) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle, alphaOverride?: number) {
    const k = p.life / p.max;
    const alpha = alphaOverride ?? 1 - k;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    switch (p.kind) {
      case 'dust':
      case 'steam':
      case 'air':
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'flash': {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, `rgba(255,240,220,${0.8 * (1 - k)})`);
        g.addColorStop(1, 'rgba(255,120,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        break;
      }
      case 'spark':
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        break;
      case 'keycap':
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `700 ${p.size * (p.char!.length > 1 ? 0.32 : 0.55)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char!, 0, 0.5);
        break;
      default:
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === 'rubber') {
          ctx.beginPath();
          ctx.moveTo(-p.size / 2, 0);
          ctx.quadraticCurveTo(0, -p.size * 0.6, p.size / 2, 0);
          ctx.quadraticCurveTo(0, p.size * 0.2, -p.size / 2, 0);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        }
    }
    ctx.restore();
  }

  private drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, rot: number, scale: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
    ctx.restore();
  }

  private render() {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.shake *= 0.86;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(sx, sy);

    ctx.drawImage(this.room.canvas, 0, 0, w, h);
    ctx.drawImage(this.decals.canvas, 0, 0, w, h);
    ctx.drawImage(this.debris.canvas, 0, 0, w, h);

    // Balloon + its floor shadow.
    const { x, y } = this.balloonPos;
    const anger = this.phase === 'inhale' ? this.pressure / 100 : this.phase === 'armed' ? this.shown / 100 : 0.12;
    const tremble = this.phase === 'inhale' ? anger * anger * 7 : 0;
    const shadow = ctx.createRadialGradient(x, this.floorY + 20, 2, x, this.floorY + 20, this.balloonR * 1.3);
    shadow.addColorStop(0, `rgba(22,58,104,${0.18 + anger * 0.1})`);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(x, this.floorY + 20, this.balloonR * 1.3, this.balloonR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    drawBalloon(ctx, {
      x: x + rand(-tremble, tremble),
      y: y + rand(-tremble, tremble) + Math.sin(this.time * 1.3) * 4,
      r: Math.max(8, this.balloonR),
      anger,
      time: this.time,
      lookX: this.held?.x ?? this.pointer.x,
      lookY: this.held?.y ?? this.pointer.y,
      stringTo: { x: w / 2, y: h + 10 },
    });

    for (const s of this.shards) this.drawShard(ctx, s);
    for (const p of this.particles) this.drawParticle(ctx, p);

    for (const f of this.flights) {
      f.trail.forEach((t, k) => {
        ctx.globalAlpha = 0.12 * (1 - k / f.trail.length);
        this.drawSprite(ctx, f.sprite, t.x, t.y, t.rot, t.scale);
      });
      ctx.globalAlpha = 1;
      this.drawSprite(ctx, f.sprite, f.x, f.y, f.rot, f.scale);
    }

    if (this.held) {
      const hd = this.held;
      ctx.save();
      ctx.shadowColor = 'rgba(22,58,104,0.35)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 18;
      this.drawSprite(ctx, hd.sprite, hd.x, hd.y, hd.rot + Math.sin(this.time * 18) * 0.04, hd.scale);
      ctx.restore();
    }

    // Vignette that tightens with rage.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * (0.35 - anger * 0.12), w / 2, h * 0.45, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    // Warm sunburst edges instead of a dark vignette.
    v.addColorStop(1, `rgba(255,${Math.round(190 - anger * 70)},40,${0.06 + anger * 0.24})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
}
