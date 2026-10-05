'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { sfx } from '@/lib/audio';

const LINKS = [
  { href: '/rage', label: 'ปาของ', short: 'ปาของ', dot: 'var(--rage)' },
  { href: '/shredder', label: 'ย่อยความในใจ', short: 'ย่อย', dot: 'var(--shred)' },
  { href: '/mash', label: 'กดรัว', short: 'กดรัว', dot: 'var(--mash)' },
  { href: '/stats', label: 'สถิติความเก็บกด', short: 'สถิติ', dot: 'var(--pop)' },
];

/** 24×24 stroke icons for the tab bar. */
const ICONS: Record<string, React.ReactNode> = {
  '/': (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9h5v-5h4v5h5v-9" />
    </>
  ),
  '/rage': (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4l-1.5 5 3 2-2 5" />
    </>
  ),
  '/shredder': (
    <>
      <path d="M6 3h12v7H6z" />
      <path d="M3 10h18v4H3z" />
      <path d="M7 14v6M10 14v4M13 14v7M16 14v5" />
    </>
  ),
  '/mash': (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10" />
    </>
  ),
  '/stats': (
    <>
      <path d="M4 20V11M10 20V5M16 20v-7M22 20H2" />
    </>
  ),
};

function Icon({ href, size = 16 }: { href: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[href]}
    </svg>
  );
}

const TABS = [{ href: '/', short: 'หน้าแรก', dot: 'var(--text)' }, ...LINKS];

export function Nav() {
  const path = usePathname();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(sfx.muted);
    return sfx.subscribe(setMuted);
  }, []);

  return (
    <>
      <header className="nav">
        <Link href="/" className="brand" aria-label="NO CHILL หน้าแรก">
          <Logo />
          <span className="brand-word">
            NO<b>CHILL</b>
          </span>
        </Link>
        <nav className="nav-links">
          <Link href="/" className={`nav-link nav-home${path === '/' ? ' is-active' : ''}`} aria-label="หน้าแรก">
            <Icon href="/" />
            <span className="long">หน้าแรก</span>
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link${path === l.href ? ' is-active' : ''}`}>
              <i style={{ background: l.dot }} />
              <span className="long">{l.label}</span>
              <span className="short">{l.short}</span>
            </Link>
          ))}
        </nav>
        <button
          className="icon-btn"
          onClick={() => {
            sfx.unlock();
            sfx.setMuted(!muted);
          }}
          aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
            {muted ? (
              <path d="M17 9l5 6M22 9l-5 6" />
            ) : (
              <>
                <path d="M16.5 8.5a5 5 0 010 7" />
                <path d="M19.5 5.5a9 9 0 010 13" />
              </>
            )}
          </svg>
        </button>
      </header>
      {/* Phone-style bottom tab bar (shown ≤ 640px, see .tabbar in globals.css). */}
      <nav className="tabbar" aria-label="เมนูหลัก">
        {TABS.map((t) => {
          const on = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`tab${on ? ' is-active' : ''}`}
              style={{ '--dot': t.dot } as React.CSSProperties}
              aria-current={on ? 'page' : undefined}
            >
              <Icon href={t.href} size={22} />
              <span>{t.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

// Twelve-point anger burst.
const BURST = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 ? 14 : 19.5;
  const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
  return `${(20 + Math.cos(a) * r).toFixed(1)},${(20 + Math.sin(a) * r).toFixed(1)}`;
}).join(' ');

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 40 40" width="34" height="34" aria-hidden>
      <polygon points={BURST} fill="var(--rage)" />
      <circle cx="15" cy="18" r="2.2" fill="#1a0706" />
      <circle cx="25" cy="18" r="2.2" fill="#1a0706" />
      <path d="M12 13.5l6 2.5M28 13.5l-6 2.5" stroke="#1a0706" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 26q5-3 10 0" stroke="#1a0706" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
