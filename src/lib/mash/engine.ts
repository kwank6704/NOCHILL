import { sfx } from '../audio';
import { haptic, HAPTIC } from '../haptics';
import { canvasFont } from '../items';
import { fracture, type Fragment } from '../shatter';
import { clamp, createLayer, lerp, paintRoom, rand, type Layer } from '../canvas';

export type MashSummary = {
  durationMs: number;
  keystrokes: number;
  peakRate: number;
  peakHeat: number;
  keyboards: number;
  popped: number;
  text: string;
};

export type MashCallbacks = {
  /** Every frame while there's activity — write straight to the DOM. */
  onTick(s: { heat: number; rate: number; keystrokes: number; text: string; overheat: number }): void;
  onActive(active: boolean): void;
  onExplode(total: number): void;
  /** Fired once per session after 20s of non-stop mashing. */
  onLong(): void;
  onFinish(summary: MashSummary): void;
};

/** Seconds of silence that end a session. */
const END_AFTER_MS = 2500;
/** Seconds at max heat before the keyboard gives up. */
const MELTDOWN_S = 1.2;
/** Keys/second that counts as 100% heat. */
const MAX_RATE = 13;

// Thai Kedmanee layout, so mashing ASDF reads ฟหกด.
const TH: Record<string, string> = {
  Backquote: '_', Digit1: 'ๅ', Digit2: '/', Digit3: '-', Digit4: 'ภ', Digit5: 'ถ', Digit6: 'ุ', Digit7: 'ึ', Digit8: 'ค', Digit9: 'ต', Digit0: 'จ', Minus: 'ข', Equal: 'ช',
  KeyQ: 'ๆ', KeyW: 'ไ', KeyE: 'ำ', KeyR: 'พ', KeyT: 'ะ', KeyY: 'ั', KeyU: 'ี', KeyI: 'ร', KeyO: 'น', KeyP: 'ย', BracketLeft: 'บ', BracketRight: 'ล', Backslash: 'ฃ',
  KeyA: 'ฟ', KeyS: 'ห', KeyD: 'ก', KeyF: 'ด', KeyG: 'เ', KeyH: '้', KeyJ: '่', KeyK: 'า', KeyL: 'ส', Semicolon: 'ว', Quote: 'ง',
  KeyZ: 'ผ', KeyX: 'ป', KeyC: 'แ', KeyV: 'อ', KeyB: 'ิ', KeyN: 'ื', KeyM: 'ท', Comma: 'ม', Period: 'ใ', Slash: 'ฝ',
};

type KeyDef = [code: string, label: string, width: number, accent?: 'yellow' | 'blue' | 'pink'];

const ROWS: KeyDef[][] = [
  [['Backquote', '`', 1], ...'1234567890'.split('').map((d): KeyDef => [`Digit${d}`, d, 1]), ['Minus', '-', 1], ['Equal', '=', 1], ['Backspace', '⌫', 2, 'pink']],
  [['Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map((c): KeyDef => [`Key${c}`, c, 1]), ['BracketLeft', '[', 1], ['BracketRight', ']', 1], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...'ASDFGHJKL'.split('').map((c): KeyDef => [`Key${c}`, c, 1]), ['Semicolon', ';', 1], ['Quote', "'", 1], ['Enter', 'Enter', 2.25, 'yellow']],
  [['ShiftLeft', 'Shift', 2.25], ...'ZXCVBNM'.split('').map((c): KeyDef => [`Key${c}`, c, 1]), ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['ShiftRight', 'Shift', 2.75]],
  [['ControlLeft', 'Ctrl', 1.5], ['AltLeft', 'Alt', 1.5], ['Space', '', 9, 'blue'], ['AltRight', 'Alt', 1.5], ['ControlRight', 'Ctrl', 1.5]],
];

const SPECIAL_GLYPH: Record<string, string> = { Space: '␣', Enter: '↵', Backspace: '⌫', Tab: '⇥', CapsLock: '⇪', ShiftLeft: '⇧', ShiftRight: '⇧', ControlLeft: '⌃', ControlRight: '⌃', AltLeft: '⌥', AltRight: '⌥' };

const ACCENT_FACE = { yellow: ['#ffe27a', '#ffc727'], blue: ['#8cc8ff', '#2f8fdc'], pink: ['#ffb3d6', '#ec5fa6'] } as const;
const ACCENT_SIDE = { yellow: '#d99a00', blue: '#1d64a8', pink: '#b83c7c' } as const;

type Key = { code: string; label: string; th: string; accent?: KeyDef[3]; x: number; row: number; w: number; press: number; popped: boolean };

type Glyph = { ch: string; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number; max: number; hot: boolean };
type Cap = { label: string; accent?: KeyDef[3]; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number };
type Shard = Fragment & { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number };
type Puff = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number };

const TRANSLATIONS = [
  'ได้ค่ะพี่ เดี๋ยวแก้ให้นะคะ 🙂',
  'ขอบคุณสำหรับฟีดแบ็กครับ จะนำไปพิจารณา',
  'รับทราบครับ 🙏',
  'ตามที่คุยกันไว้เมื่อวานนะคะ',
  'ขอลาออกค่ะ',
  'เดี๋ยวดูให้ครับ (ไม่ดู)',
  'ไม่เป็นไรค่ะ ไม่ได้โกรธเลย',
  'โอเคครับ ตามนั้น',
];

/** Deterministic "translation" of a mash so the same gibberish always means the same thing. */
export function translateMash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TRANSLATIONS[h % TRANSLATIONS.length];
}

export class MashEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private room!: Layer;
  private ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;

  private keys: Key[] = [];
  private byCode = new Map<string, Key>();
  private kb = { x: 0, y: 0, w: 0, h: 0, u: 0, pad: 0 };
  private drop = 0; // vertical offset for the replacement keyboard sliding in
  private dropV = 0;
  private gone = 0; // seconds until a new keyboard appears after a meltdown

  private hits: number[] = [];
  private heat = 0;
  private rate = 0;
  private overheat = 0;
  private shake = 0;
  private glyphs: Glyph[] = [];
  private caps: Cap[] = [];
  private shards: Shard[] = [];
  private puffs: Puff[] = [];
  private kbSprite: HTMLCanvasElement | null = null;

  private active = false;
  private start = 0;
  private lastHit = 0;
  private keystrokes = 0;
  private peakRate = 0;
  private peakHeat = 0;
  private keyboards = 0;
  private popped = 0;
  private text = '';
  private warnedLong = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: MashCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.buildKeys();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKey);
  }

  private buildKeys() {
    this.keys = [];
    ROWS.forEach((row, r) => {
      let x = 0;
      for (const [code, label, w, accent] of row) {
        const key: Key = { code, label, th: TH[code] ?? '', accent, x, row: r, w, press: 0, popped: false };
        this.keys.push(key);
        this.byCode.set(code, key);
        x += w;
      }
    });
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);

    const kw = Math.min(this.w - 24, 940);
    const u = kw / 15.7;
    const pad = u * 0.35;
    const kh = u * 5 + pad * 2;
    // Portrait phones: sit lower so there's room for flying letters above.
    const cy = this.w < 600 ? this.h * 0.6 : this.h * 0.56;
    this.kb = { x: (this.w - kw) / 2, y: cy - kh / 2, w: kw, h: kh, u, pad };
    this.room = createLayer(this.w, this.h, this.dpr);
    paintRoom(this.room.ctx, this.w, this.h, this.kb.y + kh * 0.45, 'rgba(236,95,166,0.16)');
    this.kbSprite = null;
  }

  // ---------------------------------------------------------------- input

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
    const key = this.byCode.get(e.code);
    if (!key && e.key.length !== 1) return;
    // Stop Space from scrolling, Tab from moving focus, Backspace from navigating.
    e.preventDefault();
    this.hit(key ?? this.keys[Math.floor(Math.random() * this.keys.length)], e.key.length === 1 && e.key !== ' ' ? e.key : undefined);
  };

  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // A tap on a key hits that key; a tap anywhere else hits a random one. Multi-touch friendly.
    const key = this.keyAt(x, y) ?? this.keys[Math.floor(Math.random() * this.keys.length)];
    this.hit(key);
  };

  private keyAt(x: number, y: number) {
    const { u, pad } = this.kb;
    const lx = x - this.kb.x - pad;
    const ly = y - this.kb.y - this.drop - pad;
    const row = Math.floor(ly / u);
    if (row < 0 || row > 4) return null;
    return this.keys.find((k) => k.row === row && lx >= k.x * u && lx < (k.x + k.w) * u) ?? null;
  }

  private keyRect(k: Key) {
    const { x, y, u, pad } = this.kb;
    const gap = u * 0.1;
    return { x: x + pad + k.x * u + gap / 2, y: y + this.drop + pad + k.row * u + gap / 2, w: k.w * u - gap, h: u - gap };
  }

  private hit(key: Key, typed?: string) {
    if (this.gone > 0) return; // no keyboard to hit right now
    const now = performance.now();
    sfx.unlock();
    if (!this.active) {
      this.active = true;
      this.start = now;
      this.keystrokes = 0;
      this.peakRate = 0;
      this.peakHeat = 0;
      this.keyboards = 0;
      this.popped = 0;
      this.text = '';
      this.warnedLong = false;
      this.cb.onActive(true);
    }
    this.lastHit = now;
    this.keystrokes++;
    this.hits.push(now);
    key.press = 1;

    // Always show the Kedmanee character — gibberish reads funnier in Thai (ฟหกด…).
    const ch = key.th || SPECIAL_GLYPH[key.code] || typed || key.label.slice(0, 1);
    this.text = (this.text + ch).slice(-48);

    const r = this.keyRect(key);
    const hot = this.heat > 0.6;
    this.glyphs.push({
      ch,
      x: r.x + r.w / 2,
      y: r.y,
      vx: rand(-90, 90),
      vy: -rand(260, 460) - this.heat * 200,
      rot: rand(-0.3, 0.3),
      vr: rand(-2, 2),
      size: this.kb.u * rand(0.9, 1.4) * (1 + this.heat * 0.6),
      life: 0,
      max: rand(0.9, 1.4),
      hot,
    });

    sfx.keyClick(this.heat);
    haptic(8 + Math.round(this.heat * 12));
    this.shake = Math.min(14, this.shake + 0.8 + this.heat * 2.5);

    // Keycaps start flying off once it's properly heated.
    if (!key.popped && this.heat > 0.45 && Math.random() < (this.heat - 0.45) * 0.4) {
      key.popped = true;
      this.popped++;
      this.caps.push({ label: key.label || key.th, accent: key.accent, x: r.x + r.w / 2, y: r.y + r.h / 2, vx: rand(-260, 260), vy: -rand(380, 700), rot: 0, vr: rand(-14, 14), size: Math.min(r.w, this.kb.u * 1.6), life: 0 });
      sfx.keycapPop();
    }
  }

  // ---------------------------------------------------------------- meltdown

  private explode() {
    const { x, y, w, h } = this.kb;
    const sprite = this.renderKeyboardSprite();
    for (const fr of fracture(w, h, rand(-w * 0.1, w * 0.1), rand(-h * 0.1, h * 0.1), 12)) {
      const d = Math.hypot(fr.cx, fr.cy) || 1;
      const s = rand(300, 900);
      this.shards.push({ ...fr, x: x + w / 2 + fr.cx, y: y + h / 2 + fr.cy, vx: (fr.cx / d) * s, vy: (fr.cy / d) * s - 400, rot: 0, vr: rand(-6, 6), life: 0 });
    }
    this.kbSpriteForShards = sprite;
    for (const k of this.keys) {
      if (k.popped || Math.random() < 0.5) continue;
      const r = this.keyRect(k);
      this.caps.push({ label: k.label || k.th, accent: k.accent, x: r.x + r.w / 2, y: r.y + r.h / 2, vx: rand(-500, 500), vy: -rand(400, 1000), rot: 0, vr: rand(-18, 18), size: Math.min(r.w, this.kb.u * 1.6), life: 0 });
    }
    sfx.shatter('keyboard', 1.5);
    sfx.pop();
    haptic(HAPTIC.bigSmash);
    this.shake = 32;
    this.keyboards++;
    this.cb.onExplode(this.keyboards);
    this.heat = 0.25;
    this.overheat = 0;
    this.gone = 1.3;
  }

  private kbSpriteForShards: HTMLCanvasElement | null = null;

  private renderKeyboardSprite() {
    const { w, h } = this.kb;
    const layer = createLayer(w, h, this.dpr);
    const saved = { x: this.kb.x, y: this.kb.y, drop: this.drop };
    this.kb.x = 0;
    this.kb.y = 0;
    this.drop = 0;
    this.drawKeyboard(layer.ctx);
    this.kb.x = saved.x;
    this.kb.y = saved.y;
    this.drop = saved.drop;
    return layer.canvas;
  }

  private respawn() {
    for (const k of this.keys) {
      k.popped = false;
      k.press = 0;
    }
    this.drop = -this.h * 0.7;
    this.dropV = 0;
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1000, 0, 0.033);
    this.last = now;
    this.time += dt;
    if (!this.w) return;

    const wall = performance.now();
    this.hits = this.hits.filter((t) => wall - t < 1000);
    this.rate = lerp(this.rate, this.hits.length, Math.min(1, dt * 8));
    const target = Math.min(1, this.hits.length / MAX_RATE);
    this.heat = lerp(this.heat, target, Math.min(1, dt * (target > this.heat ? 5 : 0.9)));

    if (this.gone > 0) {
      this.gone -= dt;
      if (this.gone <= 0) this.respawn();
    } else if (this.heat > 0.95) {
      this.overheat += dt;
      if (this.overheat >= MELTDOWN_S) this.explode();
    } else {
      this.overheat = Math.max(0, this.overheat - dt * 2);
    }

    // Replacement keyboard drops in with a bounce.
    this.dropV += (-this.drop * 180 - this.dropV * 14) * dt;
    this.drop += this.dropV * dt;

    if (this.active) {
      this.peakRate = Math.max(this.peakRate, this.hits.length);
      this.peakHeat = Math.max(this.peakHeat, this.heat);
      if (!this.warnedLong && wall - this.start > 20000) {
        this.warnedLong = true;
        this.cb.onLong();
      }
      this.cb.onTick({ heat: this.heat, rate: this.rate, keystrokes: this.keystrokes, text: this.text, overheat: this.overheat / MELTDOWN_S });
      if (wall - this.lastHit > END_AFTER_MS && this.gone <= 0) {
        this.active = false;
        this.cb.onActive(false);
        this.cb.onFinish({
          durationMs: Math.round(this.lastHit - this.start),
          keystrokes: this.keystrokes,
          peakRate: this.peakRate,
          peakHeat: Math.round(this.peakHeat * 100),
          keyboards: this.keyboards,
          popped: this.popped,
          text: this.text,
        });
      }
    }

    for (const k of this.keys) k.press = Math.max(0, k.press - dt * 9);

    if (this.heat > 0.7 && this.gone <= 0 && Math.random() < dt * 30 * this.heat) {
      this.puffs.push({ x: this.kb.x + rand(0.1, 0.9) * this.kb.w, y: this.kb.y + this.drop, vx: rand(-20, 20), vy: -rand(40, 90), r: rand(8, 16), life: 0, max: rand(1, 1.8) });
    }

    const g = 1800;
    for (const p of this.glyphs) {
      p.life += dt;
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.glyphs = this.glyphs.filter((p) => p.life < p.max);
    const floor = this.h - 16;
    for (const c of this.caps) {
      c.life += dt;
      c.vy += g * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > floor && c.vy > 0) {
        c.y = floor;
        c.vy *= -0.35;
        c.vx *= 0.6;
        c.vr *= 0.5;
      }
    }
    this.caps = this.caps.filter((c) => c.life < 3.5);
    for (const s of this.shards) {
      s.life += dt;
      s.vy += g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
    }
    this.shards = this.shards.filter((s) => s.life < 2.5 && s.y < this.h + 200);
    for (const p of this.puffs) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 18;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);

    this.render();
  };

  // ---------------------------------------------------------------- drawing

  private drawKeyboard(ctx: CanvasRenderingContext2D) {
    const { x, y, w, h, u } = this.kb;
    const heat = this.heat;
    const oy = y + this.drop;

    // Case.
    ctx.save();
    ctx.shadowColor = heat > 0.5 ? `rgba(255,110,40,${(heat - 0.5) * 1.2})` : 'rgba(22,58,104,0.3)';
    ctx.shadowBlur = 30 + heat * 50;
    ctx.shadowOffsetY = heat > 0.5 ? 0 : 18;
    const body = ctx.createLinearGradient(0, oy, 0, oy + h);
    body.addColorStop(0, '#f7fafd');
    body.addColorStop(1, '#c9d6e5');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x, oy, w, h, u * 0.45);
    ctx.fill();
    ctx.restore();
    if (heat > 0.3) {
      ctx.fillStyle = `rgba(255,120,50,${(heat - 0.3) * 0.45})`;
      ctx.beginPath();
      ctx.roundRect(x, oy, w, h, u * 0.45);
      ctx.fill();
    }

    const depth = u * 0.13;
    for (const k of this.keys) {
      const r = this.keyRect(k);
      if (k.popped) {
        // Bare switch where the keycap used to be.
        ctx.fillStyle = '#3a4a5e';
        ctx.beginPath();
        ctx.roundRect(r.x + r.w * 0.12, r.y + r.h * 0.12, r.w * 0.76, r.h * 0.76, u * 0.08);
        ctx.fill();
        ctx.strokeStyle = '#ff8a4c';
        ctx.lineWidth = Math.max(1.5, u * 0.07);
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        ctx.beginPath();
        ctx.moveTo(cx - u * 0.12, cy);
        ctx.lineTo(cx + u * 0.12, cy);
        ctx.moveTo(cx, cy - u * 0.12);
        ctx.lineTo(cx, cy + u * 0.12);
        ctx.stroke();
        continue;
      }
      const top = k.accent ? ACCENT_FACE[k.accent] : ['#ffffff', '#e8eef5'];
      const side = k.accent ? ACCENT_SIDE[k.accent] : '#a9b8ca';
      const sink = k.press * depth * 0.85;
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y + depth, r.w, r.h - depth, u * 0.14);
      ctx.fill();
      const face = ctx.createLinearGradient(0, r.y + sink, 0, r.y + sink + r.h - depth);
      face.addColorStop(0, top[0]);
      face.addColorStop(1, top[1]);
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y + sink, r.w, r.h - depth, u * 0.14);
      ctx.fill();
      if (k.press > 0) {
        ctx.fillStyle = `rgba(236,95,166,${k.press * 0.45})`;
        ctx.fill();
      }
      const ink = k.accent === 'blue' || k.accent === 'pink' ? 'rgba(255,255,255,0.95)' : '#12263f';
      ctx.fillStyle = ink;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      if (k.label && u > 16) {
        ctx.font = canvasFont(600, u * (k.label.length > 1 ? 0.24 : 0.3), 'body');
        ctx.fillText(k.label, r.x + u * 0.12, r.y + sink + u * 0.08);
      }
      if (k.th) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = k.accent ? ink : '#1d64a8';
        ctx.font = canvasFont(700, u * 0.4);
        ctx.fillText(k.th, r.x + r.w - u * 0.12, r.y + sink + r.h - depth - u * 0.04);
      }
    }
  }

  private render() {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.shake *= 0.85;
    ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.drawImage(this.room.canvas, 0, 0, w, h);

    // Warm glow behind the keyboard as it heats up.
    if (this.heat > 0.05) {
      const g = ctx.createRadialGradient(w / 2, this.kb.y + this.kb.h / 2, 10, w / 2, this.kb.y + this.kb.h / 2, this.kb.w * 0.8);
      g.addColorStop(0, `rgba(255,150,60,${this.heat * 0.35})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.gone <= 0) {
      const jitter = this.heat > 0.95 ? (Math.random() - 0.5) * 6 * (this.overheat / MELTDOWN_S + 0.3) : 0;
      ctx.save();
      ctx.translate(jitter, 0);
      this.drawKeyboard(ctx);
      ctx.restore();
    }

    for (const p of this.puffs) {
      ctx.globalAlpha = (1 - p.life / p.max) * 0.5;
      ctx.fillStyle = '#9aa9bb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const sprite = this.kbSpriteForShards;
    if (sprite) {
      for (const s of this.shards) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - s.life / 2.5);
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        ctx.moveTo(s.poly[0], s.poly[1]);
        for (let k = 2; k < s.poly.length; k += 2) ctx.lineTo(s.poly[k], s.poly[k + 1]);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(sprite, -s.cx - this.kb.w / 2, -s.cy - this.kb.h / 2, this.kb.w, this.kb.h);
        ctx.restore();
      }
    }

    for (const c of this.caps) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (3.5 - c.life) / 0.6));
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      const s = c.size;
      ctx.fillStyle = c.accent === 'yellow' ? '#ffc727' : c.accent === 'blue' ? '#2f8fdc' : c.accent === 'pink' ? '#ec5fa6' : '#f4f7fb';
      ctx.strokeStyle = 'rgba(22,58,104,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-s / 2, -s / 2, s, s * 0.85, s * 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.accent === 'blue' || c.accent === 'pink' ? '#fff' : '#12263f';
      ctx.font = canvasFont(700, s * (c.label.length > 1 ? 0.28 : 0.45), 'body');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 0, -s * 0.05);
      ctx.restore();
    }

    for (const p of this.glyphs) {
      const k = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.font = canvasFont(800, p.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, p.size * 0.12);
      ctx.strokeStyle = '#fff';
      ctx.strokeText(p.ch, 0, 0);
      ctx.fillStyle = p.hot ? '#e2477f' : '#1d64a8';
      ctx.fillText(p.ch, 0, 0);
      ctx.restore();
    }

    // Overheat warning flash.
    if (this.overheat > 0 && this.gone <= 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255,120,40,${0.12 + 0.12 * Math.sin(this.time * 30)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
