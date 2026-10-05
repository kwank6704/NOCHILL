'use client';

import { useEffect, useRef } from 'react';
import type { ItemKind } from '@/lib/api';
import { ITEMS, ITEM_KINDS, getSprite, clearSpriteCache, type Sprite } from '@/lib/items';
import { fracture, type Fragment } from '@/lib/shatter';
import { drawBalloon } from '@/lib/rage/balloon';
import { clamp, lerp, rand } from '@/lib/canvas';
import { sfx } from '@/lib/audio';
import { haptic, HAPTIC } from '@/lib/haptics';

type Floater = { kind: ItemKind; sprite: Sprite; x: number; y: number; z: number; rot: number; vr: number; vy: number; phase: number };
type Piece = Fragment & { sprite: Sprite; x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; life: number };

/**
 * Hero backdrop: items drift upward in parallax; click one to smash it.
 * The balloon's anger tracks how aggressively you move the mouse.
 */
export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let time = 0;
    let anger = 0.1;
    let smashes = 0;
    const mouse = { x: -999, y: -999, px: -999, py: -999 };
    let floaters: Floater[] = [];
    let pieces: Piece[] = [];

    const spawn = (anywhere: boolean): Floater => {
      const kind = ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
      const z = rand(0.35, 1);
      return {
        kind,
        sprite: getSprite(kind, dpr),
        x: rand(0, w),
        y: anywhere ? rand(0, h) : h + 120,
        z,
        rot: rand(0, 6.28),
        vr: rand(-0.5, 0.5),
        vy: -rand(14, 34) * z,
        phase: rand(0, 6.28),
      };
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const count = clamp(Math.round((w * h) / 70000), 6, 16);
      floaters = Array.from({ length: count }, () => spawn(true)).sort((a, b) => a.z - b.z);
    };

    const balloonPos = () => (w > 900 ? { x: w * 0.74, y: h * 0.48 } : { x: w * 0.5, y: h * 0.74 });

    const smash = (f: Floater) => {
      const { w: iw, h: ih } = ITEMS[f.kind];
      const scale = f.z * 0.9;
      for (const fr of fracture(iw, ih, rand(-10, 10), rand(-10, 10), 8)) {
        const c = Math.cos(f.rot);
        const s = Math.sin(f.rot);
        const lx = fr.cx * scale;
        const ly = fr.cy * scale;
        const d = Math.hypot(lx, ly) || 1;
        const sp = rand(120, 420);
        pieces.push({
          ...fr,
          sprite: f.sprite,
          x: f.x + lx * c - ly * s,
          y: f.y + lx * s + ly * c,
          vx: (lx / d) * sp,
          vy: (ly / d) * sp - 120,
          rot: f.rot,
          vr: rand(-10, 10),
          s: scale,
          life: 0,
        });
      }
      sfx.shatter(f.kind, 0.9);
      haptic(HAPTIC.smallSmash);
      anger = Math.min(1, anger + 0.25);
      smashes++;
    };

    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        const { w: iw, h: ih } = ITEMS[f.kind];
        if (Math.hypot(x - f.x, y - f.y) < (Math.max(iw, ih) / 2) * f.z * 0.9) {
          smash(f);
          floaters[i] = spawn(false);
          floaters.sort((a, b) => a.z - b.z);
          return;
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };

    const drawSprite = (sp: Sprite, x: number, y: number, rot: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.033);
      last = now;
      time += dt;

      // Mouse speed → anger.
      if (mouse.px > -999) {
        const speed = Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py) / Math.max(dt, 0.001);
        anger = lerp(anger, clamp(speed / 3000, 0, 1), dt * (speed > 600 ? 3 : 0.8));
      }
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      anger = Math.max(0.08, anger - dt * 0.05);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const f of floaters) {
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y < -140) Object.assign(f, spawn(false));
        const x = f.x + Math.sin(time * 0.6 + f.phase) * 18 * f.z;
        ctx.globalAlpha = 0.25 + f.z * 0.6;
        ctx.filter = f.z < 0.55 ? `blur(${((0.55 - f.z) * 8).toFixed(1)}px)` : 'none';
        drawSprite(f.sprite, x, f.y, f.rot, f.z * 0.9);
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;

      const b = balloonPos();
      const r = clamp(Math.min(w, h) * 0.14, 60, 150) * (1 + anger * 0.35 + Math.sin(time * 1.2) * 0.04);
      const jitter = anger * anger * 6;
      const glow = ctx.createRadialGradient(b.x, b.y, r * 0.2, b.x, b.y, r * 3);
      glow.addColorStop(0, `rgba(255,200,40,${0.18 + anger * 0.22})`);
      glow.addColorStop(1, 'rgba(255,200,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      drawBalloon(ctx, {
        x: b.x + rand(-jitter, jitter),
        y: b.y + Math.sin(time * 1.1) * 8 + rand(-jitter, jitter),
        r,
        anger,
        time,
        lookX: mouse.x > -999 ? mouse.x : b.x,
        lookY: mouse.y > -999 ? mouse.y : b.y + 50,
        stringTo: { x: b.x + 30, y: h + 20 },
      });

      pieces = pieces.filter((p) => (p.life += dt) < 1.8);
      for (const p of pieces) {
        p.vy += 1400 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / 1.8);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(p.s, p.s);
        ctx.beginPath();
        ctx.moveTo(p.poly[0], p.poly[1]);
        for (let k = 2; k < p.poly.length; k += 2) ctx.lineTo(p.poly[k], p.poly[k + 1]);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(p.sprite.canvas, -p.cx - p.sprite.w / 2, -p.cy - p.sprite.h / 2, p.sprite.w, p.sprite.h);
        ctx.restore();
      }

      canvas.dataset.smashes = String(smashes);
      if (reduced) cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    document.fonts?.ready.then(() => {
      clearSpriteCache();
      floaters.forEach((f) => (f.sprite = getSprite(f.kind, dpr)));
    });
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={ref} className="hero-canvas" aria-hidden />;
}
