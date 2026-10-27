'use client'

/* SÂN KHẤU CUỘN — khoảnh khắc duy nhất của trang V5 được tiêu nhiều công.
 *
 * Mở trang: một cuốn sổ mở DỌC như sổ ngân hàng Nhật thật — tiêu đề, câu dẫn
 * và nút được in trên trang trên; trang dưới là 普通預金, các dòng được "in"
 * ra như máy 記帳, mép dưới chạy ra khỏi màn hình như ảnh chụp cận. Cuộn xuống (khung dính lại, cuộn vẫn là cuộn thật của trình duyệt):
 *   読む    vạch quét chạy qua sổ
 *   整える  từng dòng bay sang bảng; 和暦 → 西暦, kana giữ nguyên
 *   確かめる cột 検算 điền dấu kiểm; dòng 4 lệch vì máy đọc 290,950 vào cột
 *           支払, máy đề xuất chuyển cột, số trượt sang 預り, khớp. Đóng dấu.
 * Dòng 4 là chuyện có thật: ảnh chụp app thật có「✓ 金額を入金列へ移動」.
 *
 * Mọi vị trí tính trong một hệ toạ độ thiết kế cố định (G.wide / G.tall)
 * rồi cả khung được co giãn bằng transform cho vừa màn hình. Nhờ vậy đường
 * bay của từng dòng là hằng số, không phải đo DOM khi cuộn.
 */

import {
  cubicBezier,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { V5_COPY, type V5Copy } from '@/lib/v5-copy'
import { DASHBOARD_URL } from '@/lib/constants'
import { Rosette } from './rosette'
import { Seal } from './seal'
import { ArrowIcon, PlayIcon } from './icons'

type Mode = 'wide' | 'tall'
type Box = { x: number; y: number; r: number; s: number }

/* Kích thước trang sổ (đơn vị thiết kế). Cột: lề số | 年月日 | 摘要 | 支払 | 預り | 残高 */
const BOOK = { w: 520, h: 514, top: 94, rh: 44, cols: [24, 100, 84, 100, 102, 110] }

const G = {
  wide: {
    W: 1240,
    H: 664,
    maxS: 1.12,
    hero: { x: 320, y: -64, w: 600, h: 404 },
    cap: { x: 0, y: 12, w: 560 },
    book0: { x: 320, y: 346, r: 0, s: 600 / 520 } as Box,
    book1: { x: 0, y: 156, r: 0, s: 0.94 } as Box,
    table: { x: 596, y: 156, w: 644, head: 44, rh: 44 },
    cols: [96, 30, 170, 96, 98, 98, 52],
    rosette: { x: 620, y: 330, d: 1060 },
  },
  tall: {
    W: 400,
    H: 900,
    maxS: 1.3,
    hero: { x: 0, y: -40, w: 400, h: 384 },
    cap: { x: 0, y: 0, w: 400 },
    book0: { x: 0, y: 350, r: 0, s: 400 / 520 } as Box,
    book1: { x: 0, y: 124, r: 0, s: 0.769 } as Box,
    table: { x: 0, y: 536, w: 400, head: 34, rh: 32 },
    cols: [104, 112, 104, 80],
    rosette: { x: 200, y: 360, d: 760 },
  },
}

type Row = {
  date: string
  iso: string
  kind: string
  desc: string
  /** Chữ in trên sổ (kana nửa bề ngang như máy in thật) */
  pDesc?: string
  pPayee?: string
  out?: number
  in?: number
  bal?: number
  /** Chữ VIẾT TAY nằm trên sổ */
  hand?: string
  /** Trạng thái cuối của cột 検算 */
  end: 'start' | 'ok' | 'fix' | 'note'
}

/* Lấy từ một mặt sổ thật (xem lib/sample-data.ts). Chuỗi số dư đã kiểm:
 * 25,024 −1,100 → 23,924 +58,300 → 82,224 +290,950 → 373,174 −350,000
 * → 23,174 +4,224,150 → 4,247,324 −3,700,000 → 547,324 −2,835 → 544,489 */
const ROWS: Row[] = [
  { date: '07-03-21', iso: '2025-03-21', kind: 'R', desc: 'サリユスクエアカイヒ', pPayee: 'ｻﾘﾕｽｸｴｱｶｲﾋ', out: 2750, bal: 25024, end: 'start' },
  { date: '07-03-21', iso: '2025-03-21', kind: 'R', desc: '手数料 サリユステーシヨン', pDesc: '手数料', pPayee: 'ｻﾘﾕｽﾃｰｼﾖﾝ', out: 1100, bal: 23924, end: 'ok' },
  { date: '07-03-31', iso: '2025-03-31', kind: 'L', desc: '振込2 カ）ヨンデンコウ', pDesc: '振込2', pPayee: 'ｶ)ﾖﾝﾃﾞﾝｺｳ', in: 58300, bal: 82224, end: 'ok' },
  { date: '07-03-31', iso: '2025-03-31', kind: 'K', desc: '松下水道', hand: '340950 松下水道', in: 290950, bal: 373174, end: 'fix' },
  { date: '07-03-31', iso: '2025-03-31', kind: 'Q', desc: '', out: 350000, bal: 23174, end: 'ok' },
  { date: '07-04-01', iso: '2025-04-01', kind: 'L', desc: '振込1 カ）トクシマセツケイコウ', pDesc: '振込1', pPayee: 'ｶ)ﾄｸｼﾏｾﾂｹｲｺｳ', in: 4224150, bal: 4247324, end: 'ok' },
  { date: '07-04-01', iso: '2025-04-01', kind: 'Q', desc: '', out: 3700000, bal: 547324, end: 'ok' },
  { date: '07-04-01', iso: '2025-04-01', kind: 'R', desc: 'ご融資利息', pDesc: 'ご融資利息', out: 2835, bal: 544489, end: 'ok' },
  { date: '07-04-10', iso: '2025-04-10', kind: '', desc: '新通帳に繰越', hand: '新通帳に繰越', end: 'note' },
]
const FIX_ROW = 3

const yen = (n?: number) => (n === undefined ? '' : n.toLocaleString('en-US'))

/* Mốc thời gian theo tiến độ cuộn 0 → 1 của cả khu. */
const T = {
  hero: [0, 0.07],
  move: [0.02, 0.14],
  scan: [0.15, 0.31],
  table: [0.29, 0.35],
  fly: (i: number) => [0.36 + i * 0.026, 0.46 + i * 0.026] as const,
  check: (i: number) => 0.68 + i * 0.018,
  chip: 0.775,
  fixed: 0.84,
  sum: [0.88, 0.92],
  seal: [0.92, 0.955],
  steps: [
    [0.08, 0.33],
    [0.33, 0.66],
    [0.66, 1.01],
  ],
}
/* Các ngưỡng rời rạc (đổi nhãn ở cột 検算). Mỗi lần vượt ngưỡng mới dựng lại. */
const MARKS = [...ROWS.map((_, i) => T.check(i)), T.chip, T.fixed].sort((a, b) => a - b)

const EASE = cubicBezier(0.22, 1, 0.36, 1)
const EASE_IO = cubicBezier(0.65, 0, 0.35, 1)

function useFit(ref: React.RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<{ mode: Mode; s: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const mode: Mode = w < 760 || w / h < 1.15 ? 'tall' : 'wide'
      const g = G[mode]
      const s = Math.min(w / g.W, h / g.H, g.maxS)
      setFit((f) => (f && f.mode === mode && Math.abs(f.s - s) < 0.002 ? f : { mode, s }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return fit
}

export function Story() {
  const { lang } = useI18n()
  const c = V5_COPY[lang]
  const section = useRef<HTMLElement>(null)
  const fitBox = useRef<HTMLDivElement>(null)
  const fit = useFit(fitBox)

  /* Giảm chuyển động: đọc sau khi gắn để HTML máy chủ và lần dựng đầu giống nhau. */
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* Chuyển tiến độ cuộn qua một giá trị trung gian. Motion tự "tăng tốc"
   * opacity gắn thẳng vào useScroll bằng ScrollTimeline của trình duyệt, và
   * với khung dính nó ánh xạ sai: đo được bảng mờ dần về 0 ở cuối khu dù
   * tiến độ JS đúng là 1. Qua giá trị trung gian thì mọi thứ chạy bằng JS. */
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const prog = useMotionValue(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => prog.set(v))
  useEffect(() => prog.set(scrollYProgress.get()), [prog, scrollYProgress])
  const still = useMotionValue(1)
  const p = reduce ? still : prog

  const [tick, setTick] = useState(0)
  const count = (v: number) => MARKS.filter((m) => v >= m).length
  useMotionValueEvent(p, 'change', (v) => {
    const n = count(v)
    setTick((t) => (t === n ? t : n))
  })
  useEffect(() => setTick(count(p.get())), [p])

  return (
    <section
      ref={section}
      id="story"
      className={`st ${reduce ? 'is-still' : ''}`}
      aria-label={c.story.tableTitle}
    >
      <span id="how" className="st-anchor" aria-hidden />
      {!reduce && (
        <h1 className="sr-only">
          {c.hero.title.join('')}
        </h1>
      )}
      {reduce && <StillIntro c={c} />}
      <div className="st-sticky">
        <div className="st-fit" ref={fitBox}>
          {fit && (
            <Canvas
              key={fit.mode}
              mode={fit.mode}
              s={fit.s}
              p={p}
              c={c}
              tick={tick}
              reduce={reduce}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/* Khi giảm chuyển động: phần mở đầu đứng riêng, ba bước liệt kê thẳng. */
function StillIntro({ c }: { c: V5Copy }) {
  return (
    <div className="st-still wrap">
      <HeroText c={c} />
      <ol className="st-still-steps">
        {c.story.steps.map((s) => (
          <li key={s.k}>
            <b>{s.k}</b>
            <span>{s.b}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function HeroText({ c, visualOnly = false }: { c: V5Copy; visualOnly?: boolean }) {
  const title = (
    <>
      <span>{c.hero.title[0]}</span>
      <span>{c.hero.title[1]}</span>
    </>
  )
  return (
    <div className="st-hero-in">
      {visualOnly ? (
        <p className="st-h1" aria-hidden="true">
          {title}
        </p>
      ) : (
        <h1 className="st-h1">{title}</h1>
      )}
      <p className="st-lead">{c.hero.lead}</p>
      <div className="st-cta">
        <a className="btn btn-shu" href={DASHBOARD_URL}>
          {c.nav.start}
          <ArrowIcon />
        </a>
        <a className="btn btn-line" href="#film">
          <PlayIcon />
          {c.hero.film}
          <span className="btn-meta">{c.hero.filmLen}</span>
        </a>
      </div>
    </div>
  )
}

function Canvas({
  mode,
  s,
  p,
  c,
  tick,
  reduce,
}: {
  mode: Mode
  s: number
  p: MotionValue<number>
  c: V5Copy
  tick: number
  reduce: boolean
}) {
  const g = G[mode]
  const b0 = g.book0
  const b1 = g.book1

  const heroO = useTransform(p, T.hero, [1, 0])
  const heroY = useTransform(p, T.hero, [0, -28])
  const heroVis = useTransform(p, (v) => (v > T.hero[1] ? 'hidden' : 'visible'))

  const bx = useTransform(p, T.move, [b0.x, b1.x], { ease: EASE_IO })
  const by = useTransform(p, T.move, [b0.y, b1.y], { ease: EASE_IO })
  const br = useTransform(p, T.move, [b0.r, b1.r], { ease: EASE_IO })
  const bs = useTransform(p, T.move, [b0.s, b1.s], { ease: EASE_IO })
  const rosO = useTransform(p, [0, 0.14], [1, 0.4])

  const tableO = useTransform(p, T.table, [0, 1])
  const tableY = useTransform(p, T.table, [14, 0])
  const sumO = useTransform(p, T.sum, [0, 1])
  const sumY = useTransform(p, T.sum, [10, 0])
  const sealO = useTransform(p, [T.seal[0], T.seal[0] + 0.012], [0, 1])
  const sealS = useTransform(p, T.seal, [1.4, 1], { ease: EASE })

  const zero = useMotionValue(0)
  const [printed, setPrinted] = useState(reduce)
  useEffect(() => {
    if (reduce) return
    const id = requestAnimationFrame(() => setPrinted(true))
    return () => cancelAnimationFrame(id)
  }, [reduce])

  /* Nhãn cột 検算 của từng dòng, tính từ số ngưỡng đã vượt. */
  const passed = (v: number) => MARKS.filter((m) => m <= v).length <= tick
  const state = (i: number) => {
    const r = ROWS[i]
    if (!passed(T.check(i))) return 'wait'
    if (r.end !== 'fix') return r.end
    if (passed(T.fixed)) return 'fix'
    return 'bad'
  }
  const chipOn = passed(T.chip) && !passed(T.fixed)
  const fixed = passed(T.fixed)

  const t = g.table
  return (
    <div className="st-scale" style={{ width: g.W * s, height: g.H * s }}>
      <div
        className={`st-canvas is-${mode}`}
        style={{ width: g.W, height: g.H, transform: `scale(${s})` }}
      >
        <motion.div
          className="st-rosette"
          aria-hidden
          style={{
            left: g.rosette.x - g.rosette.d / 2,
            top: g.rosette.y - g.rosette.d / 2,
            width: g.rosette.d,
            height: g.rosette.d,
            opacity: rosO,
          }}
        >
          <Rosette size={g.rosette.d} />
        </motion.div>

        {!reduce && (
          <motion.div
            className="st-hero"
            style={{
              left: g.hero.x,
              top: g.hero.y,
              width: g.hero.w,
              height: g.hero.h,
              opacity: heroO,
              y: heroY,
              visibility: heroVis,
            }}
          >
            <HeroText c={c} visualOnly />
          </motion.div>
        )}

        {!reduce && <Steps c={c} p={p} box={g.cap} />}

        <motion.div
          className="st-book"
          aria-hidden
          style={{ x: bx, y: by, rotate: br, scale: bs, width: BOOK.w, height: BOOK.h }}
        >
          <Passbook c={c} p={reduce ? zero : p} printed={printed} reduce={reduce} />
        </motion.div>

        <motion.div
          className="st-table"
          aria-hidden
          style={{
            left: t.x,
            top: t.y,
            width: t.w,
            height: t.head + ROWS.length * t.rh,
            opacity: tableO,
            y: tableY,
          }}
        >
          <div className="st-thead" style={{ height: t.head, gridTemplateColumns: g.cols.map((w) => `${w}px`).join(' ') }}>
            {(mode === 'wide' ? c.story.cols : c.story.colsShort).map((h, k) => (
              <span key={k} className={k >= (mode === 'wide' ? 3 : 1) && k < g.cols.length - 1 ? 'num' : ''}>
                {h}
              </span>
            ))}
          </div>
        </motion.div>

        {ROWS.map((r, i) => (
          <FlyRow
            key={i}
            i={i}
            row={r}
            mode={mode}
            p={p}
            c={c}
            state={state(i)}
            fixed={fixed}
          />
        ))}

        {chipOn && (
          <div
            aria-hidden
            className="st-chip"
            style={{
              left: mode === 'wide' ? t.x + 128 : t.x + 96,
              top: t.y + t.head + (FIX_ROW + 1) * t.rh + 4,
            }}
          >
            <ArrowIcon />
            {c.story.fix}
          </div>
        )}

        <motion.div
          className="st-sum"
          aria-hidden
          style={{ left: t.x, top: t.y + t.head + ROWS.length * t.rh + 14, width: t.w, opacity: sumO, y: sumY }}
        >
          {c.story.sum.map((x, k) => (
            <span key={k} className={`st-sum-${k}`}>
              {x}
            </span>
          ))}
        </motion.div>

        <motion.div
          className="st-seal"
          aria-hidden
          style={{
            left: t.x + t.w - (mode === 'wide' ? 150 : 108),
            top: t.y - (mode === 'wide' ? 112 : 104),
            opacity: sealO,
            scale: sealS,
          }}
        >
          <Seal text={c.story.seal} size={mode === 'wide' ? 112 : 92} />
        </motion.div>

        <p className="sr-only">{c.story.sr}</p>
      </div>
    </div>
  )
}

function Steps({ c, p, box }: { c: V5Copy; p: MotionValue<number>; box: { x: number; y: number; w: number } }) {
  return (
    <div className="st-steps" style={{ left: box.x, top: box.y, width: box.w }}>
      <ol className="st-verbs">
        {c.story.steps.map((s, k) => (
          <Verb key={s.k} k={k} label={s.k} p={p} />
        ))}
      </ol>
      <div className="st-step-body">
        {c.story.steps.map((s, k) => (
          <StepBody key={s.k} k={k} text={s.b} p={p} />
        ))}
      </div>
    </div>
  )
}

function range(k: number) {
  const [a, b] = T.steps[k]
  return k === T.steps.length - 1 ? { i: [a, a + 0.03], o: [0, 1] } : { i: [a, a + 0.03, b - 0.03, b], o: [0, 1, 1, 0] }
}

function Verb({ k, label, p }: { k: number; label: string; p: MotionValue<number> }) {
  const [a] = T.steps[k]
  const o = useTransform(p, [T.steps[0][0] - 0.02, T.steps[0][0]], [0, 1])
  const r = range(k)
  const on = useTransform(p, r.i, r.o)
  const ink = useTransform(on, [0, 1], ['rgba(28,29,31,0.52)', 'rgba(28,29,31,1)'])
  const bar = useTransform(p, [a, a + 0.04], [0, 1])
  return (
    <motion.li style={{ opacity: o, color: ink }}>
      <span className="st-verb-no">{k + 1}</span>
      {label}
      <motion.span className="st-verb-bar" style={{ scaleX: bar }} />
    </motion.li>
  )
}

function StepBody({ k, text, p }: { k: number; text: string; p: MotionValue<number> }) {
  const r = range(k)
  const o = useTransform(p, r.i, r.o)
  const y = useTransform(o, [0, 1], [8, 0])
  return (
    <motion.p style={{ opacity: o, y }} className="st-step-text">
      {text}
    </motion.p>
  )
}

/* ---------------- Trang sổ ---------------- */

export function Passbook({
  c,
  p,
  printed,
  reduce,
}: {
  c: V5Copy
  p: MotionValue<number>
  printed: boolean
  reduce: boolean
}) {
  const scanY = useTransform(p, T.scan, [BOOK.top - 6, BOOK.top + ROWS.length * BOOK.rh + 2])
  const scanO = useTransform(p, [T.scan[0] - 0.01, T.scan[0] + 0.01, T.scan[1] - 0.01, T.scan[1] + 0.01], [0, 1, 1, 0])
  const grid = BOOK.cols.map((w) => `${w}px`).join(' ')
  let left = 0
  const rules = BOOK.cols.slice(0, -1).map((w) => (left += w))

  return (
    <div className={`pb ${printed ? 'is-printed' : ''} ${reduce ? 'is-still' : ''}`}>
      <div className="pb-head">
        <span className="pb-reg" />
        <span className="pb-title">{c.story.book}</span>
      </div>
      <div className="pb-cols" style={{ gridTemplateColumns: grid }}>
        <span />
        {c.story.bookCols.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rules.map((x, k) => (
        <span key={k} className="pb-rule" style={{ left: x }} />
      ))}
      <div className="pb-rows">
        {ROWS.map((r, i) => (
          <PrintRow key={i} i={i} row={r} p={p} grid={grid} />
        ))}
      </div>
      <motion.span className="pb-scan" style={{ y: scanY, opacity: scanO }} />
    </div>
  )
}

function PrintRow({ i, row, p, grid }: { i: number; row: Row; p: MotionValue<number>; grid: string }) {
  const at = T.scan[0] + ((T.scan[1] - T.scan[0]) * (i + 0.5)) / ROWS.length
  const lit = useTransform(p, [at - 0.012, at, at + 0.02], [0, 1, 0.42])
  const [a] = T.fly(i)
  const ink = useTransform(p, [a, a + 0.05], [1, 0.26])
  const isOut = row.out !== undefined
  return (
    <div className="pb-row" style={{ height: BOOK.rh, ['--i' as string]: i }}>
      <motion.span className="pb-lit" style={{ opacity: lit }} />
      <span className="pb-no">{String(i + 1).padStart(2, '0')}</span>
      <motion.div className="pb-print" style={{ gridTemplateColumns: grid, opacity: ink }}>
        <span />
        <span className="pb-date">
          {row.date}
          <i>{row.kind}</i>
        </span>
        <span className="pb-desc">{row.pDesc}</span>
        <span className="pb-amt">
          {isOut && `*${yen(row.out)}`}
          {!isOut && row.pPayee && <em className="pb-kana">{row.pPayee}</em>}
        </span>
        <span className="pb-amt">
          {row.in !== undefined && `*${yen(row.in)}`}
          {isOut && row.pPayee && <em className="pb-kana">{row.pPayee}</em>}
        </span>
        <span className="pb-amt">{row.bal !== undefined && `*${yen(row.bal)}`}</span>
        {row.hand && <span className={`pb-hand ${row.end === 'note' ? 'is-note' : ''}`}>{row.hand}</span>}
      </motion.div>
    </div>
  )
}

/* ---------------- Một dòng bay sang bảng ---------------- */

function FlyRow({
  i,
  row,
  mode,
  p,
  c,
  state,
  fixed,
}: {
  i: number
  row: Row
  mode: Mode
  p: MotionValue<number>
  c: V5Copy
  state: string
  fixed: boolean
}) {
  const g = G[mode]
  const t = g.table
  const b1 = g.book1
  const top = t.y + t.head + i * t.rh
  const bookRowMid = b1.y + (BOOK.top + i * BOOK.rh + BOOK.rh / 2) * b1.s
  const dx = b1.x - t.x
  const dy = bookRowMid - (top + t.rh / 2)
  const [a, b] = T.fly(i)
  const x = useTransform(p, [a, b], [dx, 0], { ease: EASE })
  const y = useTransform(p, [a, b], [dy, 0], { ease: EASE })
  const o = useTransform(p, [a, a + 0.035], [0, 1])

  /* Dòng 4: máy đọc nhầm số vào cột 支払, sau khi sửa mới sang 預り. */
  const isFix = i === FIX_ROW
  const outV = isFix ? (fixed ? undefined : row.in) : row.out
  const inV = isFix ? (fixed ? row.in : undefined) : row.in

  const tag = c.story.tag
  const check =
    state === 'wait' ? null : state === 'start' ? (
      <span className="ck ck-start">{tag.start}</span>
    ) : state === 'ok' ? (
      <span className="ck ck-ok" aria-label={tag.ok}>
        <Tick />
      </span>
    ) : state === 'bad' ? (
      <span className="ck ck-bad">{tag.bad}</span>
    ) : state === 'fix' ? (
      <span className="ck ck-fix">
        <Tick />
        {tag.fixed}
      </span>
    ) : (
      <span className="ck ck-note">{tag.note}</span>
    )

  const rowClass = `fr is-${state} ${row.hand ? 'has-hand' : ''}`
  const style = { left: t.x, top, width: t.w, height: t.rh, x, y, opacity: o }

  if (mode === 'tall') {
    const amount = isFix
      ? fixed
        ? `+${yen(row.in)}`
        : `−${yen(row.in)}`
      : row.out !== undefined
        ? `−${yen(row.out)}`
        : row.in !== undefined
          ? `+${yen(row.in)}`
          : ''
    return (
      <motion.div aria-hidden className={rowClass} style={{ ...style, gridTemplateColumns: g.cols.map((w) => `${w}px`).join(' ') }}>
        <span className="fr-date">{row.iso}</span>
        <span className={`num fr-amt ${isFix ? 'is-moving' : ''}`}>
          {row.end === 'note' ? <span className="fr-note">{row.desc}</span> : amount}
        </span>
        <span className="num">{yen(row.bal)}</span>
        <span className="fr-ck">{check}</span>
      </motion.div>
    )
  }

  return (
    <motion.div aria-hidden className={rowClass} style={{ ...style, gridTemplateColumns: g.cols.map((w) => `${w}px`).join(' ') }}>
      <span className="fr-date">{row.iso}</span>
      <span className="fr-kind">{row.kind}</span>
      <span className="fr-desc">
        {row.desc}
        {row.end === 'note' && <span className="fr-tag">{tag.note}</span>}
      </span>
      {isFix ? (
        <span className="num fr-fixcell">
          <span className={`fr-slide ${fixed ? 'is-moved' : ''}`}>{yen(row.in)}</span>
        </span>
      ) : (
        <span className="num">{yen(outV)}</span>
      )}
      <span className="num">{isFix ? '' : yen(inV)}</span>
      <span className="num fr-bal">{yen(row.bal)}</span>
      <span className="fr-ck">{check}</span>
    </motion.div>
  )
}

/* Dấu レ của người kiểm sổ: một nét bút đỏ, vẽ ra khi hiện. */
function Tick() {
  return (
    <svg className="tick" viewBox="0 0 24 18" aria-hidden>
      <path d="M2.5 9.5c2.2 1.4 3.9 3.4 5.2 6.1C10.8 9.3 15.3 4.4 21.5 1.8" />
    </svg>
  )
}
