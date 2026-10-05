/** The "rage lung": a procedurally wobbling balloon whose face degrades with pressure. */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

export function balloonColor(anger: number) {
  return anger < 0.5 ? mixHex('#ffe27a', '#ffb81f', anger / 0.5) : mixHex('#ffb81f', '#ff6a2b', (anger - 0.5) / 0.5);
}

export type BalloonPose = {
  x: number;
  y: number;
  r: number;
  /** 0 … 1 */
  anger: number;
  time: number;
  /** Where the eyes should look (world coords). */
  lookX?: number;
  lookY?: number;
  stringTo?: { x: number; y: number };
};

export function drawBalloon(ctx: CanvasRenderingContext2D, pose: BalloonPose) {
  const { x, y, r, anger: a, time: t } = pose;
  const ry = 1.08;

  // String first so the body covers its top.
  if (pose.stringTo) {
    const kx = x;
    const ky = y + r * ry + 8;
    const { x: ex, y: ey } = pose.stringTo;
    ctx.strokeStyle = 'rgba(22,58,104,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    const midY = (ky + ey) / 2;
    ctx.bezierCurveTo(
      kx + Math.sin(t * 2.1) * 26,
      lerp(ky, midY, 0.6),
      ex + Math.sin(t * 1.7 + 1) * 30,
      lerp(midY, ey, 0.4),
      ex,
      ey,
    );
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(x, y);

  // Body silhouette: layered sines + a teardrop taper towards the knot.
  const N = 72;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const wob = 1 + 0.028 * Math.sin(3 * th + t * 1.8) + 0.018 * Math.sin(5 * th - t * 2.4) + a * 0.02 * Math.sin(9 * th + t * 14);
    const taper = 1 - 0.1 * Math.max(0, Math.sin(th)) ** 3;
    const px = Math.cos(th) * r * wob * taper;
    const py = Math.sin(th) * r * ry * wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const base = balloonColor(a);
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.15);
  body.addColorStop(0, mixHex('#ffffff', '#fff1b8', 0.4 + a * 0.3));
  body.addColorStop(0.28, base);
  body.addColorStop(1, a > 0.6 ? '#b8400f' : '#d98a00');
  ctx.shadowColor = `rgba(255,150,20,${0.2 + a * 0.5})`;
  ctx.shadowBlur = 30 + a * 70;
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Knot.
  ctx.fillStyle = a > 0.6 ? '#b8400f' : '#d98a00';
  ctx.beginPath();
  ctx.moveTo(-7, r * ry * 0.93);
  ctx.lineTo(7, r * ry * 0.93);
  ctx.lineTo(3, r * ry + 9);
  ctx.lineTo(-3, r * ry + 9);
  ctx.closePath();
  ctx.fill();

  // Glossy highlights.
  ctx.fillStyle = 'rgba(255,255,255,0.33)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.16, r * 0.26, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.74, r * 0.045, 0, Math.PI * 2);
  ctx.fill();

  drawFace(ctx, r, a, t, pose.lookX !== undefined ? pose.lookX - x : 0, pose.lookY !== undefined ? pose.lookY - y : 0);
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, r: number, a: number, t: number, lx: number, ly: number) {
  const ink = '#2a1d10';
  const eyeY = -r * 0.1;
  const eyeX = r * 0.3;
  const len = Math.hypot(lx, ly) || 1;
  const px = (lx / len) * r * 0.05;
  const py = (ly / len) * r * 0.04;

  // Blush.
  ctx.fillStyle = `rgba(255,110,60,${0.25 + a * 0.3})`;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.5, r * 0.16, r * 0.13, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes squint as anger rises.
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * eyeX, eyeY);
    ctx.fillStyle = '#fff6f2';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.14, r * 0.13 * (1 - a * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(px, py + a * r * 0.02, r * (0.06 - a * 0.015), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Brows.
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(3, r * 0.07);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.13, -r * 0.27 + a * r * 0.12);
    ctx.lineTo(s * r * 0.48, -r * 0.35 - a * r * 0.05);
    ctx.stroke();
  }

  // Mouth: grumpy curve → gritted teeth.
  const my = r * 0.33;
  if (a < 0.55) {
    ctx.lineWidth = Math.max(2.5, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, my + r * 0.04);
    ctx.quadraticCurveTo(0, my - r * (0.05 + a * 0.2), r * 0.2, my + r * 0.04);
    ctx.stroke();
  } else {
    const mw = r * (0.46 + (a - 0.55) * 0.3);
    const mh = r * 0.16;
    const shake = Math.sin(t * 60) * a * 1.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(-mw / 2 + shake, my - mh / 2, mw, mh, mh * 0.35);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-mw / 2 + shake, my);
    ctx.lineTo(mw / 2 + shake, my);
    for (let i = 1; i < 6; i++) {
      const tx = -mw / 2 + (mw / 6) * i + shake;
      ctx.moveTo(tx, my - mh / 2);
      ctx.lineTo(tx, my + mh / 2);
    }
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Manga anger vein 💢 on the forehead.
  if (a > 0.45) {
    const pulse = 1 + Math.sin(t * 12) * 0.12;
    const s = r * 0.14 * pulse * Math.min(1, (a - 0.45) * 4);
    ctx.save();
    ctx.translate(r * 0.46, -r * 0.62);
    ctx.strokeStyle = '#ffe3dc';
    ctx.lineWidth = Math.max(2.5, r * 0.035);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(s * 0.25, -s);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.3, s, -s * 0.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Sweat drop.
  if (a > 0.72) {
    const dy = ((t * 0.8) % 1) * r * 0.3;
    ctx.fillStyle = 'rgba(190,230,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, -r * 0.35 + dy);
    ctx.quadraticCurveTo(-r * 0.79, -r * 0.2 + dy, -r * 0.72, -r * 0.17 + dy);
    ctx.quadraticCurveTo(-r * 0.65, -r * 0.2 + dy, -r * 0.72, -r * 0.35 + dy);
    ctx.fill();
  }
}
