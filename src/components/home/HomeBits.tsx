'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'motion/react';
import { api, type Stats } from '@/lib/api';
import { FALLBACK_ROASTS, CoachFace } from '@/components/Coach';

export function CountUp({ value, prefix = '', decimals = 0 }: { value: number; prefix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const ctl = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (node.textContent = prefix + v.toLocaleString('th-TH', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })),
    });
    return () => ctl.stop();
  }, [inView, value, prefix, decimals]);
  return <span ref={ref}>{prefix}0</span>;
}

export function LiveCounters() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.stats().then(setStats).catch(() => setOffline(true));
  }, []);

  const plates = stats?.items.find((i) => i.item === 'plate')?.count ?? 0;
  const tiles = [
    { label: 'จานลายครามที่แตกไป', value: plates, suffix: 'ใบ' },
    { label: 'ค่าเสียหายสะสม (ที่ไม่มีใครจ่าย)', value: stats?.global.damageBaht ?? 0, prefix: '฿' },
    { label: 'ความในใจที่ถูกย่อย', value: stats?.global.grievances ?? 0, suffix: 'เรื่อง' },
    { label: 'ครั้งที่โดนโค้ชแซะ', value: stats?.global.roasted ?? 0, suffix: 'ครั้ง' },
  ];

  return (
    <section className="counters" aria-label="สถิติสด">
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          className="counter"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08 }}
        >
          <b className="counter-num mono">
            {stats ? <CountUp value={t.value} prefix={t.prefix} /> : offline ? '—' : '···'}
            {t.suffix && <small> {t.suffix}</small>}
          </b>
          <span className="counter-label">{t.label}</span>
        </motion.div>
      ))}
      {offline && <p className="counters-note">เชื่อมต่อ backend ไม่ได้ — รัน <code>npm run dev</code> ที่โฟลเดอร์หลักเพื่อเปิดทั้งคู่</p>}
    </section>
  );
}

export function RoastMarquee() {
  const lines = Object.values(FALLBACK_ROASTS).flat();
  const row = [...lines, ...lines];
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i}>
            {t}
            <i>✺</i>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rotating speech bubble for the Coach feature card. */
export function CoachPreview() {
  const lines = [FALLBACK_ROASTS.too_short[0], FALLBACK_ROASTS.too_long[0], FALLBACK_ROASTS.idle[0], FALLBACK_ROASTS.spam[1]];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 3200);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="coach-preview">
      <CoachFace size={48} />
      <motion.p key={i} initial={{ opacity: 0, y: 8, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
        {lines[i]}
      </motion.p>
    </div>
  );
}
