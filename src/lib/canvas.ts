export type Layer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

/** An offscreen canvas in CSS pixels, backed at device resolution. */
export function createLayer(w: number, h: number, dpr: number, from?: Layer): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d')!;
  if (from) ctx.drawImage(from.canvas, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx };
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let grainTile: HTMLCanvasElement | null = null;

/** A small tile of monochrome speckle used to give surfaces a gritty texture. */
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() < 0.5 ? 10 : 0;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Wall + floor backdrop shared by both breathing stages. */
export function paintRoom(ctx: CanvasRenderingContext2D, w: number, h: number, floorY: number, glow: string) {
  const wall = ctx.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#cfe7ff');
  wall.addColorStop(1, '#eaf5ff');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, floorY);

  // Faint wallpaper stripes.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let x = 0; x < w; x += 44) ctx.fillRect(x, 0, 18, floorY);

  const spot = ctx.createRadialGradient(w / 2, floorY * 0.45, 10, w / 2, floorY * 0.45, Math.max(w, h) * 0.6);
  spot.addColorStop(0, glow);
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, floorY);

  // Floor with perspective seams.
  const floor = ctx.createLinearGradient(0, floorY, 0, h);
  floor.addColorStop(0, '#b9d6f0');
  floor.addColorStop(1, '#9cc3e6');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  const vx = w / 2;
  const vy = floorY - h * 0.9;
  for (let i = -14; i <= 14; i++) {
    const bx = vx + i * (w / 9);
    const t = (floorY - vy) / (h - vy);
    ctx.beginPath();
    ctx.moveTo(vx + (bx - vx) * t, floorY);
    ctx.lineTo(bx, h);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, floorY - 1, w, 1.5);
  ctx.fillStyle = 'rgba(22,58,104,0.12)';
  ctx.fillRect(0, floorY - 9, w, 8);

  ctx.fillStyle = ctx.createPattern(grain(), 'repeat')!;
  ctx.fillRect(0, 0, w, h);
}
