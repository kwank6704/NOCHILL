import type { Metadata, Viewport } from 'next';
import { Kanit, IBM_Plex_Sans_Thai, JetBrains_Mono } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { CoachProvider } from '@/components/Coach';
import { InstallPrompt } from '@/components/InstallPrompt';
import './globals.css';

const display = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});
const body = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'NO CHILL — หายใจแรงๆ แล้วปาของ',
  description: 'แอปหายใจสาย Anti-Mindfulness สำหรับคนเก็บกด: สูดความโมโห แล้วระบายเป็นแรงปา ย่อยความในใจ และโดนโค้ชปากจัดแซะ',
  applicationName: 'NO CHILL',
  // Full-screen when added to the iOS home screen.
  appleWebApp: { capable: true, title: 'NO CHILL', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#eef7ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Draw under the notch/home indicator; CSS pads with env(safe-area-inset-*).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (Grammarly, Sapling, …) inject attributes into <html>/<body>
    // before React hydrates; this ignores attribute mismatches on these two tags only.
    <html lang="th" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <CoachProvider>
          <Nav />
          {children}
          <InstallPrompt />
        </CoachProvider>
      </body>
    </html>
  );
}
