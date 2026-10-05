'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShredderEngine, type ShredPhase, type ShredSummary } from '@/lib/shredder/engine';
import { FULL_MS } from '@/lib/rage/engine';
import { api, type ShredStyle } from '@/lib/api';
import { HoldButton } from '@/components/HoldButton';
import { useCoach, useIdleRoast, CoachFace } from '@/components/Coach';

const PRESETS = ['บั๊ก', 'งานด่วนตอนสี่ทุ่ม', 'คนเรื่องเยอะ', 'ประชุมที่ควรเป็นอีเมล', 'ลูกค้าขอแก้ "นิดเดียว"', 'รถติด'];

const STYLES: { id: ShredStyle; label: string; hint: string }[] = [
  { id: 'strip', label: 'หั่นเป็นเส้น', hint: '< 35 PSI' },
  { id: 'cross', label: 'หั่นไขว้', hint: '35–70' },
  { id: 'confetti', label: 'ป่นเป็นผง', hint: '70+' },
];

const MAX = 140;

type Result = ShredSummary & { text: string; roast: string | null; offline: boolean };

export function ShredderStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShredderEngine | null>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [phase, setPhase] = useState<ShredPhase>('compose');
  const [liveStyle, setLiveStyle] = useState<ShredStyle>('strip');
  const [result, setResult] = useState<Result | null>(null);
  const coach = useCoach();
  useIdleRoast(phase === 'compose');

  const latest = useRef({ text, isPublic, coach });
  latest.current = { text, isPublic, coach };

  useEffect(() => {
    let lastStyle: ShredStyle = 'strip';
    const engine = new ShredderEngine(canvasRef.current!, {
      onPhase: setPhase,
      onPressure(p, _ms, style) {
        holdRef.current?.style.setProperty('--p', String(p));
        if (style !== lastStyle) {
          lastStyle = style;
          setLiveStyle(style);
        }
      },
      onRelease(ms) {
        const { coach } = latest.current;
        if (ms < 900) coach.roast('too_short');
        else if (ms > FULL_MS + 1300) coach.roast('too_long');
        else if (ms > 3000 && ms < 6500 && Math.random() < 0.4) coach.roast('perfect');
      },
      async onFinish(summary) {
        lastStyle = 'strip';
        const { text: t, isPublic: pub, coach } = latest.current;
        setResult({ ...summary, text: t.trim(), roast: null, offline: false });
        try {
          const saved = await api.saveSession({
            mode: 'shredder',
            holdMs: summary.holdMs,
            peakPressure: summary.peakPressure,
            grievance: { text: t.trim(), style: summary.style, isPublic: pub },
          });
          setResult((r) => r && { ...r, roast: saved.roast?.text ?? coach.line('done') });
        } catch {
          setResult((r) => r && { ...r, roast: coach.line('done'), offline: true });
        }
      },
    });
    engineRef.current = engine;
    document.fonts?.ready.then(() => engine.setText(latest.current.text));
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    engineRef.current?.setText(text);
  }, [text]);

  const start = () => {
    coach.registerPress();
    if (!text.trim()) {
      coach.roast('empty');
      return false;
    }
    setResult(null);
    setLiveStyle('strip');
    return engineRef.current?.startInhale() ?? false;
  };

  const reset = () => {
    setResult(null);
    setText('');
    setPhase('compose');
  };

  const busy = phase === 'shredding';

  return (
    <div className={`stage stage-shred phase-${phase}`}>
      <canvas ref={canvasRef} className="stage-canvas" />

      <AnimatePresence>
        {phase === 'inhale' && (
          <motion.div className="hud hud-top shred-level" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {STYLES.map((s) => (
              <span key={s.id} className={`shred-step${s.id === liveStyle ? ' is-on' : ''}`}>
                {s.label}
                <small>{s.hint}</small>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="composer card"
        animate={{ opacity: busy || phase === 'done' ? 0 : 1, y: busy || phase === 'done' ? 40 : 0 }}
        style={{ pointerEvents: busy || phase === 'done' ? 'none' : 'auto' }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <label className="composer-label" htmlFor="grievance">
          วันนี้อะไรทำให้เซ็ง?
        </label>
        <div className="composer-row">
          <div className="composer-field">
            <textarea
              id="grievance"
              value={text}
              maxLength={MAX}
              rows={2}
              placeholder='เช่น "บั๊ก", "งานด่วนตอนสี่ทุ่ม", "คนเรื่องเยอะ"'
              onChange={(e) => setText(e.target.value)}
              disabled={phase === 'inhale'}
            />
            <span className="mono composer-count">
              {text.length}/{MAX}
            </span>
          </div>
          <HoldButton
            ref={holdRef}
            tone="shred"
            label="กดค้าง = ดูดเข้าเครื่อง"
            holdingLabel="ดูดดดด…"
            onStart={start}
            onEnd={() => engineRef.current?.endInhale()}
          />
        </div>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => setText(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span className="toggle-ui" />
          <span className="toggle-text">
            <span>
              แปะลง <b>กำแพงความเซ็ง</b> แบบนิรนาม
            </span>
            <small>ถ้าไม่ติ๊ก ข้อความจะถูกเก็บไว้แค่ในสถิติของคุณ ไม่มีใครเห็น</small>
          </span>
        </label>
      </motion.div>

      <AnimatePresence>
        {result && phase === 'done' && (
          <motion.div className="result-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="result card result-shred"
              initial={{ y: 40, scale: 0.94 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              <span className="result-stamp stamp-blue">ย่อยเรียบร้อย</span>
              <h2 className="shredded-title">
                <s>{result.text}</s>
              </h2>
              <p className="result-line">
                ถูกย่อยเป็น <em>{result.pieces}</em> ชิ้น แบบ
                <b> {STYLES.find((s) => s.id === result.style)?.label}</b>
              </p>
              <div className="receipt-meta mono">
                ดูดค้าง {(result.holdMs / 1000).toFixed(1)}s · แรงดูด {result.peakPressure} PSI
                {result.offline && ' · ออฟไลน์ (ไม่ได้บันทึก)'}
              </div>
              <div className="coach-says">
                <CoachFace mood="smug" size={40} />
                <p>{result.roast ?? '…'}</p>
              </div>
              <div className="result-actions">
                <button className="btn btn-shred" onClick={reset}>
                  ย่อยเรื่องต่อไป
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
