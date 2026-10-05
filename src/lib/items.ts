import type { ItemKind } from './api';

export type Material = 'ceramic' | 'plastic' | 'glass' | 'paper';

export const ITEMS: Record<
  ItemKind,
  { label: string; price: number; w: number; h: number; material: Material; weight: number }
> = {
  plate: { label: 'จานลายคราม', price: 120, w: 118, h: 118, material: 'ceramic', weight: 30 },
  mug: { label: 'แก้ว I ♥ MONDAY', price: 250, w: 104, h: 96, material: 'ceramic', weight: 25 },
  docs: { label: 'เอกสารด่วนที่สุด', price: 0, w: 100, h: 128, material: 'paper', weight: 18 },
  keyboard: { label: 'คีย์บอร์ดออฟฟิศ', price: 2490, w: 172, h: 64, material: 'plastic', weight: 17 },
  phone: { label: 'มือถือที่หัวหน้าโทรมา', price: 18900, w: 66, h: 126, material: 'glass', weight: 10 },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export function pickItem(): ItemKind {
  const total = ITEM_KINDS.reduce((a, k) => a + ITEMS[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of ITEM_KINDS) {
    roll -= ITEMS[k].weight;
    if (roll <= 0) return k;
  }
  return 'plate';
}

/** Resolves the next/font family for canvas text (falls back to system Thai fonts). */
export function canvasFont(weight: number, px: number, which: 'display' | 'body' = 'display') {
  let family = '';
  if (typeof document !== 'undefined') {
    family = getComputedStyle(document.body).getPropertyValue(which === 'display' ? '--font-display' : '--font-body').trim();
  }
  return `${weight} ${px}px ${family || '"Noto Sans Thai", Tahoma, sans-serif'}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---------------------------------------------------------------------------
//  Item painters — each draws centred on (0, 0) inside a w×h box.
// ---------------------------------------------------------------------------

function drawPlate(ctx: CanvasRenderingContext2D, w: number) {
  const r = w / 2 - 2;
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.7, '#f3eee4');
  body.addColorStop(1, '#d9d0c0');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c9bfad';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
  ctx.stroke();

  // Blue-and-white (ลายคราม) border: band + petals.
  ctx.strokeStyle = '#1d4c9c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2757ad';
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(r - 19, 0, 6.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r - 27, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
  ctx.stroke();

  // Centre lotus.
  ctx.fillStyle = '#1d4c9c';
  for (let k = 0; k < 8; k++) {
    ctx.save();
    ctx.rotate((k / 8) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(r * 0.17, 0, r * 0.15, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Glaze highlight.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r - 3, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
}

function drawMug(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bw = w - 26;
  const left = -w / 2 + 2;
  const top = -h / 2 + 8;

  // Handle.
  ctx.strokeStyle = '#ddd5c8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(left + bw, top + h * 0.45, 18, 22, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cylinder body.
  const g = ctx.createLinearGradient(left, 0, left + bw, 0);
  g.addColorStop(0, '#c9c1b3');
  g.addColorStop(0.25, '#ffffff');
  g.addColorStop(0.7, '#ece6dc');
  g.addColorStop(1, '#b9b0a1');
  ctx.fillStyle = g;
  roundRect(ctx, left, top, bw, h - 10, [4, 4, 16, 16]);
  ctx.fill();

  // Coffee.
  ctx.fillStyle = '#e9e2d6';
  ctx.beginPath();
  ctx.ellipse(left + bw / 2, top, bw / 2, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const coffee = ctx.createRadialGradient(left + bw / 2 - 8, top - 2, 1, left + bw / 2, top, bw / 2);
  coffee.addColorStop(0, '#7a4a2a');
  coffee.addColorStop(1, '#2c170c');
  ctx.fillStyle = coffee;
  ctx.beginPath();
  ctx.ellipse(left + bw / 2, top + 1, bw / 2 - 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Slogan.
  ctx.fillStyle = '#e8352b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(800, 17);
  ctx.fillText('I ♥', left + bw / 2, top + h * 0.34);
  ctx.font = canvasFont(800, 13);
  ctx.fillText('MONDAY', left + bw / 2, top + h * 0.55);
  ctx.font = canvasFont(500, 7, 'body');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillText('(ไม่จริง)', left + bw / 2, top + h * 0.7);
}

function drawKeyboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, '#3a3e46');
  body.addColorStop(1, '#1d1f24');
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = 6;
  const cols = 13;
  const rows = 4;
  const kw = (w - pad * 2) / cols;
  const kh = (h - pad * 2) / rows;
  const drawKey = (x: number, y: number, cw: number, color = '#454a54', top = '#5a606c') => {
    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, cw - 2, kh - 2, 3);
    ctx.fill();
    ctx.fillStyle = top;
    roundRect(ctx, x + 2.5, y + 1.8, cw - 5, kh - 5.5, 2.5);
    ctx.fill();
  };
  for (let row = 0; row < rows; row++) {
    const y = -h / 2 + pad + row * kh;
    if (row === 3) {
      drawKey(-w / 2 + pad, y, kw * 2);
      drawKey(-w / 2 + pad + kw * 2, y, kw * 8, '#3f444d', '#555b66'); // space bar
      drawKey(-w / 2 + pad + kw * 10, y, kw * 3);
      continue;
    }
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + pad + c * kw;
      if (row === 0 && c === 0) drawKey(x, y, kw, '#b8261d', '#ff4a3d');
      else if (row === 1 && c === 11) {
        drawKey(x, y, kw * 2, '#8ea61f', '#d7ff3a');
        c++;
      } else drawKey(x, y, kw);
    }
  }
}

function drawPhone(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0d0d10';
  roundRect(ctx, -w / 2, -h / 2, w, h, 13);
  ctx.fill();
  ctx.strokeStyle = '#3b3b44';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const s = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  s.addColorStop(0, '#4a1d3f');
  s.addColorStop(1, '#170b26');
  ctx.fillStyle = s;
  roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10);
  ctx.fill();

  ctx.fillStyle = '#000';
  roundRect(ctx, -9, -h / 2 + 7, 18, 5, 3);
  ctx.fill();

  // Caller avatar with a very judgy face.
  ctx.fillStyle = '#ffb199';
  ctx.beginPath();
  ctx.arc(0, -h * 0.2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a0a0a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, -h * 0.2 - 5);
  ctx.lineTo(-2, -h * 0.2 - 3);
  ctx.moveTo(7, -h * 0.2 - 5);
  ctx.lineTo(2, -h * 0.2 - 3);
  ctx.moveTo(-4, -h * 0.2 + 5);
  ctx.lineTo(4, -h * 0.2 + 5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = canvasFont(700, 11);
  ctx.fillText('หัวหน้า', 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = canvasFont(400, 7, 'body');
  ctx.fillText('สายเข้า 23:47 น.', 0, 12);

  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-14, h / 2 - 22, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.arc(14, h / 2 - 22, 8, 0, Math.PI * 2);
  ctx.fill();

  // Glass sheen.
  const sheen = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10);
  ctx.fill();
}

function drawDocs(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pw = w - 12;
  const ph = h - 10;
  ctx.save();
  ctx.rotate(-0.07);
  ctx.fillStyle = '#e4dccb';
  ctx.fillRect(-pw / 2 + 2, -ph / 2 + 2, pw, ph);
  ctx.restore();

  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);

  ctx.fillStyle = '#2a2320';
  ctx.fillRect(-pw / 2 + 9, -ph / 2 + 10, pw * 0.55, 5);
  ctx.fillStyle = 'rgba(40,30,25,0.28)';
  for (let i = 0; i < 9; i++) {
    const lw = (pw - 18) * (i % 3 === 2 ? 0.6 : 0.92);
    ctx.fillRect(-pw / 2 + 9, -ph / 2 + 24 + i * 9.5, lw, 3);
  }

  // Red "urgent" stamp.
  ctx.save();
  ctx.translate(8, ph * 0.22);
  ctx.rotate(-0.28);
  ctx.strokeStyle = 'rgba(220,30,30,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-34, -11, 68, 22);
  ctx.fillStyle = 'rgba(220,30,30,0.85)';
  ctx.font = canvasFont(800, 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ด่วนที่สุด', 0, 1);
  ctx.restore();
}

export function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind) {
  const { w, h } = ITEMS[kind];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'plate':
      drawPlate(ctx, w);
      break;
    case 'mug':
      drawMug(ctx, w, h);
      break;
    case 'keyboard':
      drawKeyboard(ctx, w, h);
      break;
    case 'phone':
      drawPhone(ctx, w, h);
      break;
    case 'docs':
      drawDocs(ctx, w, h);
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Sprites — items are pre-rendered once so shards can clip pieces out of them.
// ---------------------------------------------------------------------------

export type Sprite = { canvas: HTMLCanvasElement; w: number; h: number };

const cache = new Map<string, Sprite>();

export function getSprite(kind: ItemKind, dpr = 2): Sprite {
  const key = `${kind}@${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { w, h } = ITEMS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(w / 2, h / 2);
  drawItem(ctx, kind);
  const sprite = { canvas, w, h };
  cache.set(key, sprite);
  return sprite;
}

/** Call after web fonts load so sprites with Thai text are re-rendered correctly. */
export function clearSpriteCache() {
  cache.clear();
}
