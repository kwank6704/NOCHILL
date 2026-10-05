'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { api, type Grievance, type ItemKind, type RoastCategory, type Stats, type Totals } from '@/lib/api';
import { ITEMS } from '@/lib/items';
import { ItemIcon } from '@/components/ItemIcon';
import { CountUp } from '@/components/home/HomeBits';

const SHAME_LABEL: Record<RoastCategory, string> = {
  too_short: 'หายใจสั้นเกิน',
  too_long: 'กลั้นจนลูกโป่งแตก',
  spam: 'กดรัวแบบคนบ้าพลัง',
  idle: 'นั่งจ้องจอเฉยๆ',
  empty: 'พยายามย่อยอากาศ',
  perfect: 'หายใจดีจนน่าสงสัย',
  done: 'ระบายจบรอบ',
  mash: 'รัวคีย์บอร์ดจนน่าห่วง',
};

const thDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const thWeekday = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short' });

type Tip = { x: number; y: number; title: string; rows: [string, string, string?][] } | null;

function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const node = tip && (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{tip.title}</b>
      {tip.rows.map(([k, v, color]) => (
        <span key={k}>
          {color && <i style={{ background: color }} />}
          {k}
          <em className="mono">{v}</em>
        </span>
      ))}
    </div>
  );
  return { setTip, node };
}

export function StatsDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [wall, setWall] = useState<Grievance[]>([]);
  const [error, setError] = useState(false);
  const [scope, setScope] = useState<'me' | 'global'>('global');

  useEffect(() => {
    api
      .stats()
      .then((s) => {
        setStats(s);
        if (s.me && s.me.sessions > 0) setScope('me');
      })
      .catch(() => setError(true));
    api.grievances(18).then(setWall).catch(() => {});
  }, []);

  if (error) {
    return (
      <main className="stats">
        <div className="empty card">
          <h2>ติดต่อ backend ไม่ได้</h2>
          <p>
            เซิร์ฟเวอร์ก็เครียดเหมือนกัน รัน <code>npm run dev</code> ที่โฟลเดอร์หลัก (เปิดทั้ง backend :4000 และ frontend :3000) แล้วลองใหม่
          </p>
        </div>
      </main>
    );
  }

  const t: Totals | null = stats ? (scope === 'me' && stats.me ? stats.me : stats.global) : null;

  return (
    <main className="stats">
      <header className="stats-head">
        <div>
          <span className="eyebrow">
            <i /> Rage Report
          </span>
          <h1>รายงานความเก็บกด</h1>
          <p className="lede">ตัวเลขทั้งหมดนี้คือความเสียหายที่ไม่มีใครต้องจ่าย และคำแซะที่ไม่มีใครขอ</p>
        </div>
        <div className="seg" role="tablist" aria-label="ขอบเขตข้อมูล">
          <button role="tab" aria-selected={scope === 'me'} className={scope === 'me' ? 'on' : ''} onClick={() => setScope('me')}>
            ของฉัน
          </button>
          <button role="tab" aria-selected={scope === 'global'} className={scope === 'global' ? 'on' : ''} onClick={() => setScope('global')}>
            ทุกคน
          </button>
        </div>
      </header>

      <section className="kpis">
        {[
          { label: 'รอบที่ระบาย', value: t?.sessions ?? 0 },
          { label: 'ของที่พัง', value: t?.itemsDestroyed ?? 0, unit: 'ชิ้น' },
          { label: 'ค่าเสียหายรวม', value: t?.damageBaht ?? 0, prefix: '฿', hero: true },
          { label: 'กลั้นเฉลี่ย', value: (t?.avgHoldMs ?? 0) / 1000, unit: 'วินาที', decimals: 1 },
          { label: 'ความดันสูงสุด', value: t?.maxPressure ?? 0, unit: 'PSI' },
          { label: 'ปุ่มที่ถูกรัว', value: t?.keystrokes ?? 0, unit: 'ครั้ง' },
          { label: 'โดนโค้ชแซะ', value: t?.roasted ?? 0, unit: 'ครั้ง' },
        ].map((k, i) => (
          <motion.div
            key={`${scope}-${k.label}`}
            className={`kpi card${k.hero ? ' kpi-hero' : ''}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <span className="kpi-label">{k.label}</span>
            <b className="kpi-num mono">
              {stats ? <CountUp value={k.value} prefix={k.prefix} decimals={k.decimals} /> : '···'}
              {k.unit && <small> {k.unit}</small>}
            </b>
          </motion.div>
        ))}
      </section>
      {scope === 'me' && stats && !stats.me?.sessions && (
        <p className="scope-note">
          คุณยังไม่ได้ระบายเลยสักรอบ <Link href="/rage">ไปปาของก่อน →</Link>
        </p>
      )}

      {stats && (
        <div className="chart-grid">
          <DailyChart daily={stats.daily} />
          <PressureChart buckets={stats.pressure} />
          <ItemsChart items={stats.items} />
          <ShameList shame={stats.shame} />
        </div>
      )}

      <section className="wall-section">
        <header className="section-head">
          <span className="eyebrow">
            <i /> นิรนาม · ย่อยแล้ว
          </span>
          <h2>กำแพงความเซ็ง</h2>
        </header>
        <div className="wall">
          {wall.map((g, i) => (
            <motion.figure
              key={g.id}
              className={`grievance g-${g.style}`}
              style={{ '--tilt': `${((i * 37) % 7) - 3}deg` } as React.CSSProperties}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 6) * 0.05 }}
            >
              <blockquote>{g.text}</blockquote>
              <figcaption className="mono">{thDay(g.createdAt.slice(0, 10))}</figcaption>
            </motion.figure>
          ))}
          {!wall.length && <p className="scope-note">ยังไม่มีใครแปะอะไร</p>}
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

const RAGE = 'var(--series-rage)';
const SHRED = 'var(--series-shred)';
const MASH = 'var(--series-mash)';

function niceMax(v: number) {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (pow / 2)) * (pow / 2);
}

/** Top-rounded bar path: 4px corners on the data end, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function DailyChart({ daily }: { daily: Stats['daily'] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const { setTip, node } = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 260;
  const pad = { l: 34, r: 12, t: 16, b: 34 };
  const max = niceMax(Math.max(...daily.map((d) => d.rage + d.shredder + d.mash), 1));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / daily.length;
  const bw = Math.min(26, step * 0.62);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const last = daily[daily.length - 1];

  return (
    <figure className="chart card chart-wide">
      <figcaption>
        <h3>ระบายรายวัน</h3>
        <p>14 วันล่าสุด · จำนวนรอบ</p>
        <div className="legend">
          <span>
            <i style={{ background: RAGE }} /> ปาของ
          </span>
          <span>
            <i style={{ background: SHRED }} /> ย่อยความในใจ
          </span>
          <span>
            <i style={{ background: MASH }} /> กดรัว
          </span>
        </div>
      </figcaption>
      <div className="chart-body" ref={wrap} onMouseLeave={() => (setTip(null), setHover(null))}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟแท่งซ้อน จำนวนรอบต่อวัน แยกโหมดปาของ ย่อยความในใจ และกดรัว">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={pad.l - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}
          {daily.map((d, i) => {
            const cx = pad.l + step * i + step / 2;
            const x = cx - bw / 2;
            // Stack bottom→top with a 2px surface gap; only the topmost segment gets rounded corners.
            const segs = ([[d.rage, RAGE], [d.shredder, SHRED], [d.mash, MASH]] as const).filter(([v]) => v > 0);
            let base = y(0);
            return (
              <g
                key={d.day}
                className={hover !== null && hover !== i ? 'dim' : ''}
                onMouseEnter={(e) => {
                  setHover(i);
                  const r = wrap.current!.getBoundingClientRect();
                  const b = (e.currentTarget as SVGGElement).getBoundingClientRect();
                  setTip({
                    x: b.left - r.left + b.width / 2,
                    y: b.top - r.top,
                    title: `${thWeekday(d.day)} ${thDay(d.day)}`,
                    rows: [
                      ['ปาของ', `${d.rage} รอบ`, RAGE],
                      ['ย่อยความในใจ', `${d.shredder} รอบ`, SHRED],
                      ['กดรัว', `${d.mash} รอบ`, MASH],
                    ],
                  });
                }}
              >
                <rect x={cx - step / 2} y={pad.t} width={step} height={ih} fill="transparent" />
                {/* Rage sits on the baseline; shredder stacks above with a 2px surface gap. */}
                {segs.map(([v, color], k) => {
                  const hgt = (v / max) * ih;
                  const top = base - hgt;
                  const d = k === segs.length - 1 ? barPath(x, top, bw, hgt) : `M${x},${base}V${top}H${x + bw}V${base}Z`;
                  base = top - 2;
                  return <path key={color} d={d} fill={color} />;
                })}
                {i % 2 === 0 && (
                  <text x={cx} y={H - pad.b + 18} className="axis" textAnchor="middle">
                    {thDay(d.day)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Direct labels on the latest bar. */}
          {last && last.rage + last.shredder + last.mash > 0 && (
            <text x={W - pad.r - step / 2} y={y(last.rage + last.shredder + last.mash) - 8} className="axis strong" textAnchor="middle">
              {last.rage + last.shredder + last.mash}
            </text>
          )}
        </svg>
        {node}
      </div>
      <details className="table-view">
        <summary>ดูเป็นตาราง</summary>
        <table>
          <thead>
            <tr>
              <th>วัน</th>
              <th>ปาของ</th>
              <th>ย่อยความในใจ</th>
              <th>กดรัว</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <td>{thDay(d.day)}</td>
                <td className="mono">{d.rage}</td>
                <td className="mono">{d.shredder}</td>
                <td className="mono">{d.mash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function PressureChart({ buckets }: { buckets: number[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const { setTip, node } = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 360;
  const H = 220;
  const pad = { l: 28, r: 8, t: 14, b: 30 };
  const max = niceMax(Math.max(...buckets, 1));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / buckets.length;
  const bw = step - 2;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const peak = buckets.indexOf(Math.max(...buckets));

  return (
    <figure className="chart card">
      <figcaption>
        <h3>การกระจายความดัน</h3>
        <p>จำนวนรอบ แยกตามความดันสูงสุด (PSI)</p>
      </figcaption>
      <div className="chart-body" ref={wrap} onMouseLeave={() => (setTip(null), setHover(null))}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ฮิสโตแกรมความดันสูงสุดของแต่ละรอบ">
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={pad.l - 6} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}
          {buckets.map((n, i) => {
            const x = pad.l + i * step + 1;
            return (
              <g
                key={i}
                className={hover !== null && hover !== i ? 'dim' : ''}
                onMouseEnter={(e) => {
                  setHover(i);
                  const r = wrap.current!.getBoundingClientRect();
                  const b = (e.currentTarget as SVGGElement).getBoundingClientRect();
                  setTip({ x: b.left - r.left + b.width / 2, y: b.top - r.top, title: `${i * 10}–${i * 10 + 9} PSI`, rows: [['จำนวน', `${n} รอบ`]] });
                }}
              >
                <rect x={x - 1} y={pad.t} width={step} height={ih} fill="transparent" />
                <path d={barPath(x, y(n), bw, y(0) - y(n))} fill={RAGE} />
              </g>
            );
          })}
          {buckets[peak] > 0 && (
            <text x={pad.l + peak * step + step / 2} y={y(buckets[peak]) - 7} className="axis strong" textAnchor="middle">
              {buckets[peak]}
            </text>
          )}
          {[0, 50, 100].map((v) => (
            <text key={v} x={pad.l + (v / 100) * iw} y={H - 10} className="axis" textAnchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}>
              {v}
            </text>
          ))}
        </svg>
        {node}
      </div>
    </figure>
  );
}

function ItemsChart({ items }: { items: Stats['items'] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <figure className="chart card">
      <figcaption>
        <h3>ของที่พังมากที่สุด</h3>
        <p>จำนวนชิ้นทั้งหมด · ค่าเสียหายประเมิน</p>
      </figcaption>
      <ul className="hbars">
        {items.map((it, i) => (
          <li key={it.item} title={`${ITEMS[it.item as ItemKind]?.label}: ${it.count} ชิ้น`}>
            <ItemIcon kind={it.item} size={36} />
            <div className="hbar-main">
              <div className="hbar-top">
                <span>{ITEMS[it.item as ItemKind]?.label ?? it.item}</span>
                <b className="mono">{it.count.toLocaleString('th-TH')}</b>
              </div>
              <div className="hbar-track">
                <motion.i
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(it.count / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="hbar-sub mono">{it.price ? `฿${(it.price * it.count).toLocaleString('th-TH')}` : 'ไม่มีมูลค่า (เหมือนงานที่ทำ)'}</span>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function ShameList({ shame }: { shame: Stats['shame'] }) {
  const max = Math.max(...shame.map((s) => s.n), 1);
  return (
    <figure className="chart card">
      <figcaption>
        <h3>หอเกียรติยศแห่งความอับอาย</h3>
        <p>ข้อหาที่โดนโค้ชแซะบ่อยที่สุด (ทุกคน)</p>
      </figcaption>
      {shame.length ? (
        <ol className="shame">
          {shame.map((s, i) => (
            <li key={s.category}>
              <span className="shame-rank mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="shame-label">{SHAME_LABEL[s.category] ?? s.category}</span>
              <span className="shame-bar">
                <i style={{ width: `${(s.n / max) * 100}%` }} />
              </span>
              <b className="mono">{s.n}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="scope-note">ยังไม่มีใครโดนแซะ… ยังนะ</p>
      )}
    </figure>
  );
}
