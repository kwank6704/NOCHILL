'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { MashEngine, translateMash, type MashSummary } from '@/lib/mash/engine';
import { api } from '@/lib/api';
import { ITEMS, clearSpriteCache } from '@/lib/items';
import { useCoach, useIdleRoast, CoachFace } from '@/components/Coach';

type Result = MashSummary & { damage: number; roast: string | null; offline: boolean };

const HEAT_LEVELS: [number, string][] = [
  [95, 'จะระเบิดแล้ว!!'],
  [75, 'ควันขึ้น'],
  [50, 'ร้อนมือ'],
  [25, 'เริ่มมัน'],
  [0, 'อุ่นเครื่อง'],
];
const heatLabel = (p: number) => (HEAT_LEVELS.find(([min]) => p >= min) ?? HEAT_LEVELS[HEAT_LEVELS.length - 1])[1];

export function MashStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const rateRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [boards, setBoards] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const coach = useCoach();
  useIdleRoast(!active && !result);

  const coachRef = useRef(coach);
  coachRef.current = coach;

  useEffect(() => {
    const engine = new MashEngine(canvasRef.current!, {
      onTick({ heat, rate, keystrokes, text, overheat }) {
        const p = Math.round(heat * 100);
        meterRef.current?.style.setProperty('--p', String(p));
        meterRef.current?.classList.toggle('is-overheat', overheat > 0);
        if (heatRef.current) heatRef.current.textContent = String(p).padStart(2, '0');
        if (labelRef.current) labelRef.current.textContent = heatLabel(p);
        if (rateRef.current) rateRef.current.textContent = `${rate.toFixed(1)} ปุ่ม/วิ`;
        if (countRef.current) countRef.current.textContent = keystrokes.toLocaleString('th-TH');
        // Show only the newest characters that fit on one line.
        if (textRef.current) textRef.current.textContent = text.slice(window.innerWidth < 600 ? -16 : -34);
      },
      onActive(a) {
        setActive(a);
        if (a) {
          setResult(null);
          setBoards(0);
        }
      },
      onExplode: setBoards,
      onLong: () => coachRef.current.roast('mash'),
      async onFinish(summary) {
        const c = coachRef.current;
        if (summary.keystrokes < 8) {
          c.roast('too_short');
          return;
        }
        const damage = summary.keyboards * ITEMS.keyboard.price;
        setResult({ ...summary, damage, roast: null, offline: false });
        try {
          const saved = await api.saveSession({
            mode: 'mash',
            holdMs: summary.durationMs,
            peakPressure: summary.peakHeat,
            keystrokes: summary.keystrokes,
            keyboards: summary.keyboards,
          });
          setResult((r) => r && { ...r, damage: saved.damageBaht, roast: saved.roast?.text ?? c.line('mash') });
        } catch {
          setResult((r) => r && { ...r, roast: c.line('mash'), offline: true });
        }
      },
    });
    document.fonts?.ready.then(clearSpriteCache);
    return () => engine.destroy();
  }, []);

  return (
    <div className={`stage stage-mash${active ? ' is-active' : ''}`}>
      <canvas ref={canvasRef} className="stage-canvas" />

      <div className="hud hud-top">
        <div ref={meterRef} className={`meter meter-mash${active ? ' is-live' : ''}`}>
          <div className="meter-read">
            <span className="meter-label">ความร้อนคีย์บอร์ด</span>
            <span className="meter-num">
              <span ref={heatRef}>00</span>
              <small>°</small>
            </span>
          </div>
          <div className="meter-bar">
            <i />
          </div>
          <div className="meter-foot">
            <span ref={labelRef}>อุ่นเครื่อง</span>
            <span ref={rateRef} className="mono">
              0.0 ปุ่ม/วิ
            </span>
          </div>
        </div>

        <div className="mash-tally">
          <span className="ammo-label">รัวไปแล้ว</span>
          <b className="mono" ref={countRef}>
            0
          </b>
          {boards > 0 && <span className="mash-boards">💥 คีย์บอร์ดพัง {boards}</span>}
        </div>
      </div>

      <div ref={textRef} className="mash-text mono" aria-live="off" />

      <div className="hud hud-hint">
        <AnimatePresence mode="wait">
          <motion.p key={active ? 'on' : 'off'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {active ? (
              <>
                รัวต่อ! ร้อนถึง 100° ค้างไว้ <b>คีย์บอร์ดจะระเบิด</b> · หยุด 2.5 วิ = จบรอบ
              </>
            ) : (
              <>
                <b>รัวปุ่มอะไรก็ได้</b> หรือ <b>แตะรัวจอ</b> (ใช้หลายนิ้วพร้อมกันได้)
              </>
            )}
          </motion.p>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {result && !active && (
          <motion.div className="result-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="result card result-mash"
              initial={{ y: 40, scale: 0.94 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <span className="result-stamp stamp-pink">รายงานการรัว</span>
              <h2>
                รัวไป <em>{result.keystrokes.toLocaleString('th-TH')}</em> ปุ่ม
              </h2>
              <div className="mash-stats">
                <div>
                  <b className="mono">{(result.durationMs / 1000).toFixed(1)}s</b>
                  <span>ใช้เวลา</span>
                </div>
                <div>
                  <b className="mono">{result.peakRate}</b>
                  <span>ปุ่ม/วิ สูงสุด</span>
                </div>
                <div>
                  <b className="mono">{result.popped}</b>
                  <span>ปุ่มหลุด</span>
                </div>
                <div>
                  <b className="mono">{result.keyboards}</b>
                  <span>คีย์บอร์ดพัง</span>
                </div>
              </div>
              <div className="mash-translate">
                <span className="mono">“{result.text.slice(-28)}”</span>
                <p>
                  แปลว่า: <b>{translateMash(result.text)}</b>
                </p>
              </div>
              {result.damage > 0 && (
                <div className="receipt-total">
                  <span>ค่าคีย์บอร์ด (ที่ไม่ต้องจ่าย)</span>
                  <b className="mono">฿{result.damage.toLocaleString('th-TH')}</b>
                </div>
              )}
              {result.offline && <div className="receipt-meta mono">ออฟไลน์ (ไม่ได้บันทึก)</div>}
              <div className="coach-says">
                <CoachFace mood="smug" size={40} />
                <p>{result.roast ?? '…'}</p>
              </div>
              <div className="result-actions">
                <button className="btn btn-mash" onClick={() => setResult(null)}>
                  รัวอีกรอบ
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
