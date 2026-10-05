import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NO CHILL — หายใจแรงๆ แล้วปาของ',
    short_name: 'NO CHILL',
    description: 'แอปหายใจสาย Anti-Mindfulness: ปาของ ย่อยความในใจ กดรัวแป้น และโดนโค้ชปากจัดแซะ',
    lang: 'th',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef7ff',
    theme_color: '#eef7ff',
    categories: ['entertainment', 'lifestyle'],
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'ปาของ', url: '/rage' },
      { name: 'ย่อยความในใจ', url: '/shredder' },
      { name: 'กดรัวแป้น', url: '/mash' },
    ],
  };
}
