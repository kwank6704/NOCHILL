import { renderIcon } from '@/lib/appIcon';

/**
 * App icons, drawn in code: a grumpy sun on a sky tile.
 * Served at /icon/<id>; the manifest points at the 192/512/maskable variants.
 */
const VARIANTS = {
  small: { size: 32, maskable: false },
  '192': { size: 192, maskable: false },
  '512': { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

type Id = keyof typeof VARIANTS;

export function generateImageMetadata() {
  return (Object.keys(VARIANTS) as Id[]).map((id) => ({
    id,
    size: { width: VARIANTS[id].size, height: VARIANTS[id].size },
    contentType: 'image/png',
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const v = VARIANTS[(await id) as Id] ?? VARIANTS['192'];
  return renderIcon(v.size, v.maskable);
}
