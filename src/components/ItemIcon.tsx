'use client';

import { useEffect, useRef } from 'react';
import type { ItemKind } from '@/lib/api';
import { ITEMS, drawItem } from '@/lib/items';

/** Renders one of the procedural items at icon size. */
export function ItemIcon({ kind, size = 40, tilt = 0 }: { kind: ItemKind; size?: number; tilt?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const paint = () => {
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = size * dpr;
      c.height = size * dpr;
      const ctx = c.getContext('2d')!;
      const { w, h } = ITEMS[kind];
      const s = (size * 0.86) / Math.max(w, h);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, (size * dpr) / 2, (size * dpr) / 2);
      ctx.rotate(tilt);
      drawItem(ctx, kind);
    };
    paint();
    // Repaint once Thai web fonts are ready so labels render in Kanit.
    document.fonts?.ready.then(paint);
  }, [kind, size, tilt]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-label={ITEMS[kind].label} role="img" />;
}
