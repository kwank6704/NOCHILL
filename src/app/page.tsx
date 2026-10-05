import Link from 'next/link';
import { HeroCanvas } from '@/components/home/HeroCanvas';
import { LiveCounters, RoastMarquee, CoachPreview } from '@/components/home/HomeBits';
import { ItemIcon } from '@/components/ItemIcon';

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <HeroCanvas />
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> แอปหายใจสาย Anti-Mindfulness
          </span>
          <h1>
            หายใจเข้า… <s className="calm">สงบ</s> <span className="rage-word">โมโห</span>
            <br />
            หายใจออก… <span className="underline">ปาจานใส่กำแพง</span>
          </h1>
          <p className="lede">
            สำหรับคนเก็บกดที่เบื่อแอปสมาธิโลกสวย กดค้างเพื่อสูดความหงุดหงิดเข้าไปจนลูกโป่งจะแตก แล้วสไวป์ระบายออกเป็นแรงปา
            ไม่มีใครเดือดร้อน ไม่ต้องจ่ายค่าจาน
          </p>
          <div className="hero-cta">
            <Link href="/rage" className="btn btn-primary btn-lg">
              เริ่มปาของ <span aria-hidden>→</span>
            </Link>
            <Link href="/shredder" className="btn btn-ghost btn-lg">
              ย่อยความในใจ
            </Link>
          </div>
          <p className="hero-hint">
            <span className="pulse-dot" /> ลองคลิกของที่ลอยอยู่ หรือขยับเมาส์แรงๆ ใส่ลูกโป่งดู
          </p>
        </div>
      </section>

      <RoastMarquee />
      <LiveCounters />

      <section className="modes">
        <header className="section-head">
          <span className="eyebrow">
            <i /> สี่วิธีระบาย
          </span>
          <h2>
            ไม่ต้อง<s>ปล่อยวาง</s> ปล่อยของ
          </h2>
        </header>

        <div className="mode-grid">
          <Link href="/rage" className="mode-card mode-rage">
            <span className="mode-num mono">01</span>
            <div className="mode-art art-rage">
              <div className="gauge">
                <i />
              </div>
              <div className="art-items">
                <ItemIcon kind="plate" size={64} tilt={-0.3} />
                <ItemIcon kind="keyboard" size={78} tilt={0.2} />
                <ItemIcon kind="mug" size={58} tilt={0.35} />
              </div>
            </div>
            <h3>สูดความโมโห แล้วระบายเป็นแรงปา</h3>
            <p>
              <b>กดค้าง</b> = สูดความหงุดหงิด ลูกโป่งพองและสั่นระริก ตัวเลขความดันพุ่งปรี๊ด
              <br />
              <b>ปล่อยแล้วสไวป์</b> = ปาจาน คีย์บอร์ด แก้วกาแฟ ให้แตกกระจาย พร้อมเสียงและแรงสั่นสะใจ
            </p>
            <span className="mode-go">ไปปาเลย →</span>
          </Link>

          <Link href="/shredder" className="mode-card mode-shred">
            <span className="mode-num mono">02</span>
            <div className="mode-art art-shred">
              <div className="mini-paper">งานด่วน 4 ทุ่ม</div>
              <div className="mini-machine" />
              <div className="mini-strips">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
                ))}
              </div>
            </div>
            <h3>เครื่องบดความในใจ</h3>
            <p>
              พิมพ์สิ่งที่เกลียด กดค้างดูดเข้าเครื่อง ยิ่งดูดนานยิ่งย่อยละเอียด จากหั่นเส้น → หั่นไขว้ → ป่นเป็นผง
              แล้วปลิวหายไปกับลม
            </p>
            <span className="mode-go">ไปย่อยเลย →</span>
          </Link>

          <Link href="/mash" className="mode-card mode-mash">
            <span className="mode-num mono">03</span>
            <div className="mode-art art-mash">
              <span className="mini-glyphs">ฟหกดดดด!!</span>
              <div className="mini-kb">
                {Array.from({ length: 30 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${((i * 7) % 10) * 0.09}s` }} />
                ))}
              </div>
            </div>
            <h3>กดรัวแป้น</h3>
            <p>
              รัวปุ่มอะไรก็ได้ หรือแตะรัวจอมือถือหลายนิ้วพร้อมกัน ยิ่งรัวคีย์บอร์ดยิ่งร้อน ปุ่มเริ่มหลุดกระเด็น ร้อนถึง 100° ค้างไว้
              <b> คีย์บอร์ดระเบิด</b> — จบรอบแล้วแอปจะ &quot;แปล&quot; สิ่งที่คุณรัวให้
            </p>
            <span className="mode-go">ไปรัวเลย →</span>
          </Link>

          <Link href="/stats" className="mode-card mode-coach">
            <span className="mode-num mono">04</span>
            <div className="mode-art art-coach">
              <CoachPreview />
            </div>
            <h3>โค้ชปากจัด (ด่าแทนใจ)</h3>
            <p>
              หายใจสั้นไป กลั้นนานไป กดมั่ว หรือนั่งจ้องจอเฉยๆ — โค้ชไม่ปลอบแบบโลกสวย แต่จะแซะให้เจ็บนิดๆ
              ทุกคำแซะถูกนับเข้าสถิติ
            </p>
            <span className="mode-go">ดูสถิติความเก็บกด →</span>
          </Link>
        </div>
      </section>

      <footer className="footer">
        <p>
          <b>NO CHILL</b> — ทำขึ้นเพื่อความบันเทิง ไม่ใช่การรักษาทางการแพทย์ ถ้าความเครียดหนักจนรับมือไม่ไหว
          คุยกับคนที่ไว้ใจ หรือโทรสายด่วนสุขภาพจิต <b>1323</b> ได้ตลอด 24 ชม.
        </p>
      </footer>
    </main>
  );
}
