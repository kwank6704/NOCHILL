'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'nochill:install-dismissed';
const SNOOZE_MS = 7 * 86_400_000;
/** Only nag on calm pages — never on top of a hold button mid-rage. */
const PAGES = new Set(['/', '/stats']);

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallPrompt() {
  const path = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's mini-infobar quiet; we show our own
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const ua = navigator.userAgent;
    // iOS has no install prompt API — explain the Share-sheet route instead (Safari only).
    const iosSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIos(iosSafari);
    const t = setTimeout(() => setOpen(true), 3500);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setOpen(false);
    else dismiss();
  };

  const show = open && PAGES.has(path) && (deferred || ios);

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          className="install card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          aria-label="ติดตั้งแอป"
        >
          <img src="/icon/192" alt="" width={44} height={44} />
          <div className="install-body">
            <b>ติดตั้ง NO CHILL ลงมือถือ</b>
            {deferred ? (
              <span>เปิดเต็มจอเหมือนแอป ระบายได้ทันทีไม่ต้องเปิดเบราว์เซอร์</span>
            ) : (
              <span>
                แตะ{' '}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="แชร์">
                  <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>{' '}
                แล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b>
              </span>
            )}
          </div>
          {deferred && (
            <button className="btn btn-primary btn-sm" onClick={install}>
              ติดตั้ง
            </button>
          )}
          <button className="install-x" onClick={dismiss} aria-label="ปิด">
            ×
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
