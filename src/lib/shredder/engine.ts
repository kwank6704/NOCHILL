import type { ShredStyle } from '../api';
import { sfx, type Loop } from '../audio';
import { haptic, HAPTIC } from '../haptics';
import { canvasFont } from '../items';
import { clamp, createLayer, lerp, paintRoom, rand, type Layer } from '../canvas';
import { FULL_MS, pressureAt } from '../rage/engine';

export type ShredPhase = 'compose' | 'inhale' | 'shredding' | 'done';

export type ShredSummary = { holdMs: number; peakPressure: number; style: ShredStyle; pieces: number };

export type ShredCallbacks = {
  onPhase(phase: ShredPhase): void;
  onPressure(pressure: number, holdMs: number, style: ShredStyle): void;
  onRelease(holdMs: number, pressure: number): void;
  onFinish(summary: ShredSummary): void;
};

export const styleFor = (pressure: number): ShredStyle => (pressure < 35 ? 'strip' : pressure < 70 ? 'cross' : 'confetti');

type Piece = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  flip: number;
  flipSpeed: number;
  seed: number;
  age: number;
  max: number;
};

type Speck = { x: number; y: number; vx: number; vy: number; life: number };

export class ShredderEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private room!: Layer;
  private paper: Layer | null = null;
  private pw = 0;
  private ph = 0;
  private text = '';
  private ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;

  private phase: ShredPhase = 'compose';
  private holdStart = 0;
  private holdMs = 0;
  private pressure = 0;
  private style: ShredStyle = 'strip';
  private inhaleLoop: Loop | null = null;
  private motor: Loop | null = null;
  private fed = 0;
  private feedSpeed = 0;
  private descent = 0;
  private wind = 0;
  private pieces: Piece[] = [];
  private specks: Speck[] = [];
  private shake = 0;
  private finishAt = 0;
  private nextBuzz = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: ShredCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.inhaleLoop?.stop();
    this.motor?.stop();
  }

  // ---------------------------------------------------------------- geometry

  private get geo() {
    const mw = clamp(this.w * 0.8, 260, 440);
    // Phones: the composer card covers the lower half, so hang the machine higher.
    const slotY = this.h * (this.w < 600 ? 0.4 : 0.47);
    const mh = clamp(this.h * 0.14, 84, 120);
    return { mx: this.w / 2, mw, mh, slotY, exitY: slotY + mh - 14 };
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.room = createLayer(this.w, this.h, this.dpr);
    paintRoom(this.room.ctx, this.w, this.h, this.h * 0.9, 'rgba(255,214,80,0.28)');
    this.renderPaper();
  }

  // ---------------------------------------------------------------- paper

  setText(text: string) {
    this.text = text.trim();
    if (this.phase === 'compose' || this.phase === 'done') this.renderPaper();
  }

  private renderPaper() {
    if (!this.w) return;
    const { mw, slotY } = this.geo;
    const pw = Math.round(Math.min(mw * 0.72, 300));
    // Leave room for the nav bar + the paper's resting gap above the slot.
    const ph = Math.round(clamp(Math.min(pw * 1.25, slotY - 130), 150, 400));
    this.pw = pw;
    this.ph = ph;
    const layer = createLayer(pw, ph, this.dpr);
    const ctx = layer.ctx;

    ctx.fillStyle = '#fbf7ee';
    ctx.fillRect(0, 0, pw, ph);
    ctx.strokeStyle = 'rgba(70,130,200,0.18)';
    ctx.lineWidth = 1;
    for (let y = 44; y < ph - 10; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(pw, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(230,60,60,0.35)';
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(26, ph);
    ctx.stroke();

    // Coffee ring, because of course.
    ctx.strokeStyle = 'rgba(120,70,30,0.12)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(pw - 42, ph - 46, 24, 0.3, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = 'rgba(40,30,25,0.55)';
    ctx.font = canvasFont(600, 11, 'body');
    ctx.textBaseline = 'top';
    ctx.fillText('บันทึกความเซ็ง', 34, 14);
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), pw - 12, 14);
    ctx.textAlign = 'left';

    const body = this.text || 'พิมพ์สิ่งที่ทำให้เซ็งด้านล่าง ↓';
    ctx.fillStyle = this.text ? '#1d1613' : 'rgba(40,30,25,0.3)';
    const maxW = pw - 48;
    const maxH = ph - 90;
    let size = 40;
    let lines: string[] = [];
    for (; size >= 15; size -= 2) {
      ctx.font = canvasFont(700, size);
      lines = wrapThai(ctx, body, maxW);
      if (lines.length * size * 1.35 <= maxH) break;
    }
    const lh = size * 1.35;
    const top = 44 + Math.max(0, (maxH - lines.length * lh) / 2);
    lines.forEach((line, i) => ctx.fillText(line, 36, top + i * lh));

    ctx.fillStyle = 'rgba(40,30,25,0.4)';
    ctx.font = canvasFont(400, 10, 'body');
    ctx.fillText('ลงชื่อ ......................  (ไม่ต้องก็ได้)', 34, ph - 26);
    this.paper = layer;
  }

  // ---------------------------------------------------------------- controls

  startInhale(): boolean {
    if (this.phase === 'done') this.setPhase('compose');
    if (this.phase !== 'compose' || !this.text) return false;
    sfx.unlock();
    this.renderPaper();
    this.holdStart = performance.now();
    this.pressure = 0;
    this.inhaleLoop = sfx.inhaleLoop();
    this.setPhase('inhale');
    return true;
  }

  endInhale() {
    if (this.phase !== 'inhale') return;
    this.holdMs = performance.now() - this.holdStart;
    this.pressure = pressureAt(Math.min(this.holdMs, FULL_MS));
    this.inhaleLoop?.stop();
    this.inhaleLoop = null;
    this.cb.onRelease(this.holdMs, this.pressure);
    this.style = styleFor(this.pressure);
    this.fed = 0;
    this.feedSpeed = this.ph / (1.25 - (0.45 * this.pressure) / 100);
    this.wind = (Math.random() < 0.5 ? -1 : 1) * (140 + 4 * this.pressure);
    this.motor = sfx.shredderLoop();
    this.setPhase('shredding');
  }

  private setPhase(p: ShredPhase) {
    this.phase = p;
    this.cb.onPhase(p);
  }

  // ---------------------------------------------------------------- simulation

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1000, 0, 0.033);
    this.last = now;
    this.time += dt;
    if (!this.w || !this.paper) return;

    const { mx, slotY } = this.geo;

    if (this.phase === 'inhale') {
      this.holdMs = Math.max(0, now - this.holdStart);
      this.pressure = pressureAt(Math.min(this.holdMs, FULL_MS));
      this.inhaleLoop?.update(this.pressure / 100);
      this.cb.onPressure(this.pressure, this.holdMs, styleFor(this.pressure));
      if (now >= this.nextBuzz) {
        haptic(Math.round(5 + this.pressure * 0.2));
        this.nextBuzz = now + 450 - this.pressure * 3;
      }
      // Vacuum: specks drift toward the slot.
      if (Math.random() < dt * (20 + this.pressure)) {
        const a = rand(Math.PI, Math.PI * 2);
        const r = rand(160, 320);
        this.specks.push({ x: mx + Math.cos(a) * r, y: slotY + Math.sin(a) * r * 0.6, vx: 0, vy: 0, life: 0 });
      }
    }
    this.descent = lerp(this.descent, this.phase === 'inhale' ? 1 : 0, Math.min(1, dt * 6));

    for (const s of this.specks) {
      s.life += dt;
      const dx = mx + rand(-this.pw / 2, this.pw / 2) - s.x;
      const dy = slotY - s.y;
      s.vx += dx * dt * 5;
      s.vy += dy * dt * 5;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.specks = this.specks.filter((s) => s.life < 1.2 && Math.abs(s.y - slotY) > 6);

    if (this.phase === 'shredding') {
      if (this.fed < this.ph) {
        this.fed = Math.min(this.ph, this.fed + this.feedSpeed * dt);
        this.motor?.update(1);
        this.shake = 2.5 + this.pressure * 0.03;
        if (now >= this.nextBuzz) {
          haptic(HAPTIC.shred);
          this.nextBuzz = now + 260;
        }
        if (this.fed >= this.ph) this.release();
      } else {
        this.motor?.update(0.15);
        this.shake *= 0.9;
      }
    } else {
      this.shake *= 0.9;
    }

    const keep: Piece[] = [];
    for (const p of this.pieces) {
      p.age += dt;
      p.vy += 260 * dt;
      p.vy = Math.min(p.vy, 170 + Math.sin(this.time * 3 + p.seed) * 60);
      p.vx += (this.wind - p.vx) * 0.7 * dt;
      p.x += (p.vx + Math.sin(this.time * 2.3 + p.seed) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.flipSpeed * dt;
      if (p.age < p.max && p.y < this.h + 60 && p.x > -80 && p.x < this.w + 80) keep.push(p);
    }
    this.pieces = keep;

    if (this.phase === 'shredding' && this.fed >= this.ph && (this.pieces.length === 0 || now >= this.finishAt)) {
      this.motor?.stop();
      this.motor = null;
      this.setPhase('done');
      this.cb.onFinish({ holdMs: Math.round(this.holdMs), peakPressure: Math.round(this.pressure), style: this.style, pieces: this.lastCount });
    }

    this.render();
  };

  private lastCount = 0;

  private release() {
    const { mx, exitY } = this.geo;
    const cols = this.style === 'strip' ? 14 : this.style === 'cross' ? 18 : 26;
    const sw = this.pw / cols;
    const segLen = this.style === 'strip' ? this.ph : this.style === 'cross' ? 28 : sw * 1.1;
    const left = mx - this.pw / 2;
    const mid = (cols - 1) / 2;
    const pieces: Piece[] = [];
    for (let i = 0; i < cols; i++) {
      for (let sy = 0; sy < this.ph; sy += segLen) {
        const sh = Math.min(segLen, this.ph - sy);
        pieces.push({
          sx: i * sw,
          sy,
          sw,
          sh,
          x: left + i * sw + sw / 2 + (i - mid) * 3,
          y: exitY + sy + sh / 2,
          vx: (i - mid) * 12 + rand(-30, 30),
          vy: rand(20, 120),
          rot: (i - mid) * 0.02,
          vr: rand(-2, 2) * (this.style === 'strip' ? 0.6 : 2.5),
          flip: rand(0, 6.28),
          flipSpeed: rand(3, 9),
          seed: rand(0, 100),
          age: 0,
          max: rand(3.5, 5.5),
        });
      }
    }
    this.pieces = pieces;
    this.lastCount = pieces.length;
    this.finishAt = performance.now() + 2600;
    sfx.shatter('docs', 0.8);
    haptic(HAPTIC.bigSmash);
  }

  // ---------------------------------------------------------------- rendering

  private render() {
    const { ctx, w, h, dpr } = this;
    const { mx, mw, mh, slotY, exitY } = this.geo;
    const paper = this.paper!;
    const pw = this.pw;
    const ph = this.ph;
    const p = this.pressure / 100;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.room.canvas, 0, 0, w, h);

    // Wind streaks while pieces fly.
    if (this.pieces.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) {
        const y = ((i * 97 + this.time * 40) % (h * 0.6)) + h * 0.4;
        const x = (((i * 211 + this.time * this.wind * 1.4) % (w + 200)) + w + 200) % (w + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.sign(this.wind) * 80, y);
        ctx.stroke();
      }
    }

    const jx = (Math.random() - 0.5) * this.shake;
    const jy = (Math.random() - 0.5) * this.shake;
    const tremble = this.phase === 'inhale' ? p * p * 4 : 0;
    const left = mx - pw / 2;

    // Paper above the slot.
    if (this.phase !== 'done' && this.fed < ph) {
      const bob = this.phase === 'compose' ? Math.sin(this.time * 1.6) * 6 : 0;
      const rest = slotY - 34 + bob;
      const bottom = lerp(rest, slotY + 6 * p, this.descent) + this.fed;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, slotY);
      ctx.clip();
      const tilt = this.phase === 'compose' ? Math.sin(this.time * 0.9) * 0.02 : 0;
      ctx.translate(mx + rand(-tremble, tremble), bottom + rand(-tremble, tremble));
      ctx.rotate(tilt);
      ctx.shadowColor = 'rgba(22,58,104,0.28)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 14;
      ctx.drawImage(paper.canvas, -pw / 2, -ph, pw, ph);
      ctx.restore();
    }

    // Vacuum specks.
    ctx.fillStyle = 'rgba(22,58,104,0.5)';
    for (const s of this.specks) {
      ctx.globalAlpha = Math.min(1, s.life * 3) * 0.6;
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Strips emerging from the exit while feeding.
    if (this.phase === 'shredding' && this.fed < ph) {
      const cols = this.style === 'strip' ? 14 : this.style === 'cross' ? 18 : 26;
      const sw = pw / cols;
      const segLen = this.style === 'strip' ? ph : this.style === 'cross' ? 28 : sw * 1.1;
      const prog = this.fed / ph;
      const mid = (cols - 1) / 2;
      const sy = ph - this.fed;
      for (let i = 0; i < cols; i++) {
        ctx.save();
        ctx.translate(left + i * sw + sw / 2 + (i - mid) * 3 * prog + jx, exitY);
        ctx.rotate((i - mid) * 0.018 * prog + Math.sin(this.time * 9 + i) * 0.015);
        for (let y = 0; y < this.fed; y += segLen) {
          const hh = Math.min(segLen, this.fed - y) - (this.style === 'strip' ? 0 : 1.5);
          if (hh <= 0) continue;
          ctx.drawImage(paper.canvas, i * sw * this.dpr, (sy + y) * this.dpr, sw * this.dpr, hh * this.dpr, -sw / 2 + 0.5, y, sw - 1, hh);
        }
        ctx.restore();
      }
    }

    // Free-flying pieces, flipping over to show the paper's back.
    for (const pc of this.pieces) {
      const fade = Math.min(1, (pc.max - pc.age) / 0.8);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(pc.x, pc.y);
      ctx.rotate(pc.rot);
      const flip = Math.cos(pc.flip);
      ctx.scale(Math.abs(flip) < 0.08 ? 0.08 : flip, 1);
      if (flip < 0) {
        ctx.fillStyle = '#ddd5c4';
        ctx.fillRect(-pc.sw / 2, -pc.sh / 2, pc.sw, pc.sh);
      } else {
        ctx.drawImage(paper.canvas, pc.sx * this.dpr, pc.sy * this.dpr, pc.sw * this.dpr, pc.sh * this.dpr, -pc.sw / 2, -pc.sh / 2, pc.sw, pc.sh);
      }
      ctx.restore();
    }

    this.drawMachine(ctx, mx + jx, mw, mh, slotY + jy, exitY + jy);
  }

  private drawMachine(ctx: CanvasRenderingContext2D, mx: number, mw: number, mh: number, slotY: number, exitY: number) {
    const x = mx - mw / 2;
    const y = slotY - 20;
    const running = this.phase === 'shredding' && this.fed < this.ph;
    const p = this.pressure / 100;

    ctx.save();
    ctx.shadowColor = 'rgba(22,58,104,0.4)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    const body = ctx.createLinearGradient(0, y, 0, y + mh);
    body.addColorStop(0, '#6a87a6');
    body.addColorStop(0.18, '#43607f');
    body.addColorStop(1, '#263d58');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x, y, mw, mh, 16);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, mw - 1, mh - 1, 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 14, y + 5, mw - 28, 2);

    // Feed slot with glowing, chewing teeth.
    const sw = this.pw + 26;
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.roundRect(mx - sw / 2, slotY - 5, sw, 10, 5);
    ctx.fill();
    const glow = running ? 0.9 : this.phase === 'inhale' ? 0.25 + p * 0.5 : 0.08;
    ctx.fillStyle = `rgba(255,196,40,${glow})`;
    const off = (this.time * (running ? 220 : 30 + p * 120)) % 8;
    for (let tx = mx - sw / 2 + 6 + off; tx < mx + sw / 2 - 6; tx += 8) ctx.fillRect(tx, slotY - 1.5, 3, 3);

    // Exit.
    ctx.fillStyle = '#050505';
    ctx.fillRect(mx - sw / 2, exitY - 3, sw, 5);

    // Labels.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = canvasFont(800, 13);
    ctx.fillText('SHRED-O-MATIC 3000', x + 22, y + mh * 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = canvasFont(400, 10, 'body');
    ctx.fillText('เครื่องย่อยความในใจ · ไม่รับคืน', x + 22, y + mh * 0.55 + 17);

    // Vents.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + mw - 90 + i * 11, y + mh * 0.42, 5, mh * 0.34);

    // Status LED.
    const led = running ? '#ff3b2f' : this.phase === 'inhale' ? '#ffb020' : '#46e07a';
    const pulse = this.phase === 'inhale' ? 0.5 + Math.sin(this.time * (6 + p * 20)) * 0.5 : 1;
    ctx.save();
    ctx.shadowColor = led;
    ctx.shadowBlur = 14 * pulse;
    ctx.fillStyle = led;
    ctx.beginPath();
    ctx.arc(x + mw - 22, y + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Word-wrap that understands Thai (no spaces between words) via Intl.Segmenter. */
function wrapThai(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), (s) => s.segment)
      : text.split(/(\s+)/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line + word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line.trimEnd());
      line = word.trimStart();
    } else {
      line = test;
    }
    // Hard-break a single word longer than the line.
    while (ctx.measureText(line).width > maxW && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}
