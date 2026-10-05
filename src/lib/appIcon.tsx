import { ImageResponse } from 'next/og';

/** Grumpy sun on a sky tile — shared by /icon/* and /apple-icon. */
// Twelve-point burst, same geometry as the nav logo.
const BURST = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 ? 14 : 19.5;
  const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
  return `${(20 + Math.cos(a) * r).toFixed(2)},${(20 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

export function renderIcon(size: number, maskable: boolean) {
  // Maskable icons get cropped to a circle/squircle — keep the sun inside the safe zone.
  const sun = Math.round(size * (maskable ? 0.62 : size <= 32 ? 1 : 0.78));
  const radius = maskable || size <= 32 ? 0 : Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius,
          background: size <= 32 ? 'transparent' : 'linear-gradient(160deg, #bfe2ff 0%, #eef7ff 100%)',
        }}
      >
        <svg width={sun} height={sun} viewBox="0 0 40 40">
          <polygon points={BURST} fill="#ffc727" stroke="#f59f00" strokeWidth="0.8" />
          <circle cx="15" cy="18.5" r="2.2" fill="#12263f" />
          <circle cx="25" cy="18.5" r="2.2" fill="#12263f" />
          <path d="M12 13.5l6 2.5M28 13.5l-6 2.5" stroke="#12263f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M15 26.5q5-3 10 0" stroke="#12263f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
