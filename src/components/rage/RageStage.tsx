'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { RageEngine, type RagePhase, type RageSummary } from '@/lib/rage/engine';
import { api, type ItemKind } from '@/lib/api';
import { ITEMS, clearSpriteCache } from '@/lib/items';
import { HoldButton } from '@/components/HoldButton';
import { ItemIcon } from '@/components/ItemIcon';
import { useCoach, useIdleRoast, CoachFace } from '@/components/Coach';

const LEVELS: [number, string][] = [
  [92, 'วิกฤต!! ปล่อยเดี๋ยวนี้'],
  [75, 'ใกล้ระเบิด'],
  [55, 'เส้นเลือดปูด'],
  [35, 'ควันเริ่มออกหู'],
  [15, 'เริ่มเดือด'],
  [0, 'หงุดหงิดนิดๆ'],
];
const levelOf = (p: number) => (LEVELS.find(([min]) => p >= min) ?? LEVELS[LEVELS.length - 1])[1];

type Result = RageSummary & { damage: number; roast: string | null; offline: boolean };

const baht = (n: number) => `฿${n.toLocaleString('th-TH')}`;

export function RageStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RageEngine | null>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const psiRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  const [phase, setPhase] = useState<RagePhase>('idle');
  const [ammo, setAmmo] = useState({ left: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const coach = useCoach();
  useIdleRoast(phase === 'idle' || phase === 'armed');

  // Keep latest coach in a ref so the engine (created once) always calls the fresh one.
  const coachRef = useRef(coach);
  coachRef.current = coach;

  const finish = useCallback(async (summary: RageSummary) => {
    const local = Object.entries(summary.items).reduce((a, [k, n]) => a + ITEMS[k as ItemKind].price * (n ?? 0), 0);
    setResult({ ...summary, damage: local, roast: null, offline: false });
    try {
      const saved = await api.saveSession({ mode: 'rage', ...summary });
      setResult((r) => r && { ...r, damage: saved.damageBaht, roast: saved.roast?.text ?? coachRef.current.line('done') });
    } catch {
      setResult((r) => r && { ...r, roast: coachRef.current.line('done'), offline: true });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new RageEngine(canvas, {
      onPhase: setPhase,
      onPressure(p, ms) {
        const v = Math.round(p);
        if (psiRef.current) psiRef.current.textContent = String(v).padStart(2, '0');
        if (levelRef.current) levelRef.current.textContent = levelOf(p);
        if (timeRef.current) timeRef.current.textContent = `${(ms / 1000).toFixed(1)}s`;
        meterRef.current?.style.setProperty('--p', String(p));
        holdRef.current?.style.setProperty('--p', String(p));
      },
      onAmmo: (left, total) => setAmmo({ left, total }),
      onRelease(ms, _p, burst) {
        const c = coachRef.current;
        if (burst) c.roast('too_long');
        else if (ms < 900) c.roast('too_short');
        else if (ms > 3000 && ms < 6500 && Math.random() < 0.45) c.roast('perfect');
      },
      onFinish: finish,
    });
    engineRef.current = engine;
    document.fonts?.ready.then(clearSpriteCache);

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e) || (e.code !== 'Space' && e.code !== 'Enter') || e.repeat) return;
      e.preventDefault();
      const ph = engine.getPhase();
      if (ph === 'armed') engine.throwRandom();
      else if (ph === 'idle' || ph === 'done') {
        setResult(null);
        coachRef.current.registerPress();
        engine.startInhale();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') engine.endInhale();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      engine.destroy();
    };
  }, [finish]);

  const again = () => {
    setResult(null);
    setPhase('idle');
  };

  const showMeter = phase === 'inhale' || phase === 'armed';

  return (
    <div className={`stage stage-rage phase-${phase}`}>
      <canvas ref={canvasRef} className="stage-canvas" />

      <div className="hud hud-top">
        <div ref={meterRef} className={`meter${showMeter ? ' is-live' : ''}`}>
          <div className="meter-read">
            <span className="meter-label">ความดันโมโห</span>
            <span className="meter-num">
              <span ref={psiRef}>00</span>
              <small>PSI</small>
            </span>
          </div>
          <div className="meter-bar">
            <i />
          </div>
          <div className="meter-foot">
            <span ref={levelRef}>หงุดหงิดนิดๆ</span>
            <span ref={timeRef} className="mono">
              0.0s
            </span>
          </div>
        </div>

        <AnimatePresence>
          {phase === 'armed' && (
            <motion.div className="ammo" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <span className="ammo-label">กระสุนอารมณ์</span>
              <div className="ammo-pips">
                {Array.from({ length: ammo.total }, (_, i) => (
                  <i key={i} className={i < ammo.left ? 'on' : ''} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="hud hud-hint">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {phase === 'idle' && (
              <>
                <b>กดค้าง</b> เพื่อสูดความโมโหเข้าไป ยิ่งกลั้นนาน ยิ่งได้ของปาเยอะ
              </>
            )}
            {phase === 'inhale' && (
              <>
                สูดเข้าไปอีก… <b>ปล่อย</b> เมื่อพร้อมระเบิด
              </>
            )}
            {phase === 'armed' && (
              <>
                <b>แตะค้างที่ไหนก็ได้ → ลากแล้วเหวี่ยง</b> ใส่กำแพง · ปล่อยช้าๆ = ทำหล่นพื้น
              </>
            )}
            {phase === 'done' && <>ระบายเสร็จแล้ว… รึยัง?</>}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="hud hud-bottom">
        {(phase === 'idle' || phase === 'inhale') && (
          <HoldButton
            ref={holdRef}
            label="กดค้าง = หายใจเข้า"
            holdingLabel="สูดดดด…"
            onStart={() => {
              setResult(null);
              coach.registerPress();
              engineRef.current?.startInhale();
            }}
            onEnd={() => engineRef.current?.endInhale()}
          />
        )}
        {phase === 'armed' && (
          <button className="btn btn-ghost btn-sm" onClick={() => engineRef.current?.throwRandom()}>
            ปาสุ่มให้หน่อย <kbd>Space</kbd>
          </button>
        )}
        <p className="kbd-hint">
          คีย์บอร์ด: กด <kbd>Space</kbd> ค้างเพื่อหายใจเข้า
        </p>
      </div>

      <AnimatePresence>
        {result && phase === 'done' && (
          <motion.div
            className="result-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="result card"
              initial={{ y: 40, scale: 0.94, rotate: -1.5 }}
              animate={{ y: 0, scale: 1, rotate: 0 }}
              exit={{ y: 20, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <span className="result-stamp">ใบแจ้งค่าเสียหาย</span>
              <h2>
                ระบายไป <em>{Object.values(result.items).reduce((a, b) => a + (b ?? 0), 0)}</em> ชิ้น
              </h2>
              <ul className="receipt">
                {(Object.entries(result.items) as [ItemKind, number][]).map(([k, n]) => (
                  <li key={k}>
                    <ItemIcon kind={k} size={34} />
                    <span>{ITEMS[k].label}</span>
                    <span className="mono">×{n}</span>
                    <span className="mono">{baht(ITEMS[k].price * n)}</span>
                  </li>
                ))}
              </ul>
              <div className="receipt-total">
                <span>รวมค่าเสียหาย (ที่ไม่ต้องจ่าย)</span>
                <b className="mono">{baht(result.damage)}</b>
              </div>
              <div className="receipt-meta mono">
                กลั้น {(result.holdMs / 1000).toFixed(1)}s · ความดันสูงสุด {result.peakPressure} PSI
                {result.offline && ' · ออฟไลน์ (ไม่ได้บันทึก)'}
              </div>
              <div className="coach-says">
                <CoachFace mood="smug" size={40} />
                <p>{result.roast ?? '…'}</p>
              </div>
              <div className="result-actions">
                <button className="btn btn-primary" onClick={again}>
                  หายใจอีกรอบ
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    engineRef.current?.cleanUp();
                    again();
                  }}
                >
                  เก็บกวาดแล้วเริ่มใหม่
                </button>
                <Link className="btn btn-link" href="/stats">
                  ดูสถิติ →
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
