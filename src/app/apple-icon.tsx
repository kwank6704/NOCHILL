import { renderIcon } from '@/lib/appIcon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS rounds the corners itself, so render a full-bleed tile.
export default function AppleIcon() {
  return renderIcon(180, true);
}
