'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, type Roast, type RoastCategory } from '@/lib/api';
import { sfx } from '@/lib/audio';
import { haptic, HAPTIC } from '@/lib/haptics';

/** Offline fallback so the coach still roasts you when the backend is down. */
export const FALLBACK_ROASTS: Record<RoastCategory, string[]> = {
  too_short: ['หายใจเข้าสั้นขนาดนี้ รีบไปไหน? ใจเย็นก่อน!', 'นั่นเรียกว่าสะอึก ไม่ใช่หายใจ'],
  too_long: ['กดแช่ลืมหายใจออก ปอดไม่ได้ทำจากเหล็กนะ!', 'จะกลั้นไปถึงไหน จะเขียวแล้วนั่น'],
  spam: ['กดรัวๆ แบบนี้ นึกว่าเล่นเกมตู้', 'ใจเย็น นิ้วไม่ได้ทำผิดอะไรเลย'],
  idle: ['พักสายตาจากจอแล้วถอนหายใจยาวๆ สักทีเถอะ เห็นทำหน้าบึ้งมาครึ่งชั่วโมงแล้ว', 'ยังอยู่ไหม? หรือโมโหจนหลับไปแล้ว'],
  empty: ['จะย่อยอากาศเหรอ พิมพ์อะไรหน่อย', 'ไม่มีอะไรให้เซ็งเลยเหรอ? ไม่เชื่อหรอก'],
  perfect: ['หายใจได้ดี... ดีจนน่าสงสัยว่าเคยไปรีทรีตมา', 'โอเค วันนี้ยอมรับว่าหายใจเป็น'],
  done: ['ระบายเสร็จแล้วก็กลับไปทำงานต่อ เดดไลน์ไม่รอใคร', 'รู้สึกดีขึ้นไหม? ไม่ต้องตอบ ดูหน้าก็รู้'],
  mash: ['พอแล้ว คีย์บอร์ดมีครอบครัวนะ', 'นิ้วจะเป็นตะคริวแล้ว พักหายใจก่อน'],
};

const TAGS: Record<RoastCategory, string> = {
  too_short: 'หายใจสั้นไป',
  too_long: 'กลั้นนานไป',
  spam: 'กดมั่ว',
  idle: 'นิ่งนานไป',
  empty: 'ไม่มีอะไรให้ย่อย',
  perfect: 'ชมแบบแซะ',
  done: 'สรุปผล',
  mash: 'รัวนานไป',
};

type Toast = { id: number; category: RoastCategory; text: string };

type CoachApi = {
  /** Show a roast. Returns the text, or null if the category is cooling down. */
  roast(category: RoastCategory): string | null;
  /** Pick a roast line without showing a toast. */
  line(category: RoastCategory): string;
  /** Call on every press — returns true if the user is spamming. */
  registerPress(): boolean;
};

const CoachContext = createContext<CoachApi | null>(null);

export function useCoach() {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error('useCoach must be used inside <CoachProvider>');
  return ctx;
}

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const bank = useRef<Partial<Record<RoastCategory, Roast[]>>>({});
  const cooldown = useRef<Partial<Record<RoastCategory, number>>>({});
  const lastText = useRef<string>('');
  const presses = useRef<number[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    api.roasts().then((r) => (bank.current = r)).catch(() => {});
  }, []);

  const line = useCallback((category: RoastCategory) => {
    const pool = bank.current[category]?.map((r) => r.text) ?? FALLBACK_ROASTS[category];
    const options = pool.length > 1 ? pool.filter((t) => t !== lastText.current) : pool;
    const text = options[Math.floor(Math.random() * options.length)];
    lastText.current = text;
    return text;
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const roast = useCallback(
    (category: RoastCategory) => {
      const now = Date.now();
      if ((cooldown.current[category] ?? 0) > now) return null;
      cooldown.current[category] = now + 5000;
      const text = line(category);
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-1), { id, category, text }]);
      setTimeout(() => dismiss(id), 4800);
      sfx.bonk();
      haptic(HAPTIC.roast);
      api.logRoast(category).catch(() => {});
      return text;
    },
    [line, dismiss],
  );

  const registerPress = useCallback(() => {
    const now = Date.now();
    presses.current = [...presses.current.filter((t) => now - t < 2500), now];
    if (presses.current.length >= 4) {
      presses.current = [];
      roast('spam');
      return true;
    }
    return false;
  }, [roast]);

  const value = useMemo(() => ({ roast, line, registerPress }), [roast, line, registerPress]);

  return (
    <CoachContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast toast-${t.category}`}
              initial={{ opacity: 0, y: -30, scale: 0.9, rotate: -2 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: [0, -2.5, 2.5, -1.5, 0] }}
              exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
              // Springs only support two keyframes, so the wobble gets its own tween.
              transition={{ type: 'spring', stiffness: 500, damping: 26, rotate: { type: 'tween', duration: 0.5, ease: 'easeOut' } }}
              onClick={() => dismiss(t.id)}
              role="status"
            >
              <CoachFace mood={t.category === 'perfect' || t.category === 'done' ? 'smug' : 'mad'} />
              <div className="toast-body">
                <div className="toast-head">
                  <b>โค้ชปากจัด</b>
                  <span className="toast-tag">{TAGS[t.category]}</span>
                </div>
                <p>{t.text}</p>
              </div>
              <span className="toast-timer" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </CoachContext.Provider>
  );
}

/** Roasts the user after `ms` of no pointer/keyboard activity while `active`. */
export function useIdleRoast(active: boolean, ms = 25000) {
  const { roast } = useCoach();
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(fire, ms);
    function fire() {
      roast('idle');
      timer = window.setTimeout(fire, ms * 1.6);
    }
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(fire, ms);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [active, ms, roast]);
}

export function CoachFace({ mood = 'mad', size = 44 }: { mood?: 'mad' | 'smug'; size?: number }) {
  return (
    <svg className="coach-face" viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`cf-${mood}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={mood === 'mad' ? '#ffd3b0' : '#ffe08a'} />
          <stop offset="1" stopColor={mood === 'mad' ? '#ff7a3d' : '#e8a317'} />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill={`url(#cf-${mood})`} />
      {/* Whistle cord — a proper coach */}
      <path d="M8 36q16 14 32 0" stroke="#1b1b1b" strokeWidth="1.6" fill="none" opacity=".5" />
      {mood === 'mad' ? (
        <>
          <path d="M12 16l9 3.5M36 16l-9 3.5" stroke="#260606" strokeWidth="3" strokeLinecap="round" />
          <circle cx="17" cy="23" r="2.6" fill="#260606" />
          <circle cx="31" cy="23" r="2.6" fill="#260606" />
          <path d="M16 34q8-5 16 0" stroke="#260606" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M12 18q5-3 9 0M27 18q5-3 9 0" stroke="#2a1a02" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M13 23h8M27 23h8" stroke="#2a1a02" strokeWidth="3" strokeLinecap="round" />
          <path d="M17 32q9 5 15-2" stroke="#2a1a02" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
