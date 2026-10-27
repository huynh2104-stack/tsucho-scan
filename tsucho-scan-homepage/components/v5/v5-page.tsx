'use client'

import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { BrandMark } from '@/components/brand'
import { LANGS, useI18n } from '@/lib/i18n'
import { DASHBOARD_URL } from '@/lib/constants'
import { SAMPLE_ROWS, yen } from '@/lib/sample-data'
import { V5_COPY, type V5Copy } from '@/lib/v5-copy'
import { Story } from './story'
import { Seal } from './seal'
import { Rosette } from './rosette'
import { PauseGlyph, PlayGlyph, ToolDemo } from './tool-demo'
import {
  ArrowIcon,
  CloseIcon,
  CrossIcon,
  DownloadIcon,
  MenuIcon,
  PlayIcon,
  PlusIcon,
} from './icons'

const EASE = [0.22, 1, 0.36, 1] as const

function useCopy(): V5Copy {
  return V5_COPY[useI18n().lang]
}

/* Hai dòng tiêu đề: ngắt đúng chỗ đã định, không để trình duyệt tự ngắt
 * giữa cụm từ tiếng Nhật. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l) => (
        <span key={l} className="ln">
          {l}
        </span>
      ))}
    </>
  )
}

/* Trang chưa có (điều khoản, liên hệ…) mở hộp "đang chuẩn bị": trông như
 * một trang web hoàn chỉnh nhưng nói rõ dịch vụ còn đang phát triển. */
type DlgKind = 'page' | 'contact'
const DemoCtx = createContext<(k?: DlgKind) => void>(() => {})
const useDemo = () => useContext(DemoCtx)

export function V5Page() {
  const { lang } = useI18n()
  const [demo, setDemo] = useState<DlgKind | null>(null)
  const meta = V5_COPY[lang].meta
  useEffect(() => {
    document.title = meta
  }, [meta])
  return (
    <DemoCtx.Provider value={(k = 'page') => setDemo(k)}>
    <div className="v5" data-lang={lang}>
      <Header />
      <main id="main">
        <Story />
        <Verify />
        <Film />
        <Reads />
        <Limits />
        <Pricing />
        <Final />
      </main>
      <Footer />
      <DemoDialog kind={demo} onClose={() => setDemo(null)} />
    </div>
    </DemoCtx.Provider>
  )
}

function DemoDialog({ kind, onClose }: { kind: DlgKind | null; onClose: () => void }) {
  const c = useCopy()
  const box = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const back = useRef<Element | null>(null)
  const open = kind !== null
  useEffect(() => {
    if (!open) return
    back.current = document.activeElement
    close.current?.focus()
    /* Khoá cuộn nền; giữ Tab quanh quẩn trong hộp (aria-modal không tự làm việc này). */
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !box.current) return
      const f = box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      html.style.overflow = prev
      ;(back.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dlg-back"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18 } }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
        >
          <motion.div
            ref={box}
            className="dlg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dlg-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE } }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.14 } }}
          >
            <span className="hd-badge">{c.dev.badge}</span>
            {kind === 'contact' ? (
              <>
                <h2 id="dlg-title">{c.contact.dlgTitle}</h2>
                <p>{c.contact.body}</p>
                <p className="dlg-note">{c.contact.note}</p>
                <p className="dlg-mail">
                  <span>{c.contact.exLabel}</span>
                  {c.contact.email}
                </p>
              </>
            ) : (
              <>
                <h2 id="dlg-title">{c.demo.title}</h2>
                <p>{c.demo.body}</p>
              </>
            )}
            <div className="dlg-act">
              <a className="btn btn-shu" href={DASHBOARD_URL}>
                {c.nav.start}
                <ArrowIcon />
              </a>
              <button ref={close} type="button" className="btn btn-line" onClick={onClose}>
                {c.demo.close}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- Thanh trên ---------------- */

function LangSwitch() {
  const { lang, setLang } = useI18n()
  const c = useCopy()
  return (
    <div className="lang" role="group" aria-label={c.nav.lang}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code === 'jp' ? 'ja' : l.code === 'vn' ? 'vi' : 'en'}
          aria-pressed={lang === l.code}
          title={l.label}
          onClick={() => setLang(l.code)}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}

function Header() {
  const c = useCopy()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const href = (id: string) => (id === 'story' ? '#how' : `#${id}`)
  return (
    <header className="hd">
      <a className="skip" href="#main">
        {c.skip}
      </a>
      <div className="hd-in">
        <a className="brand" href="#story" aria-label="通帳スキャン">
          <BrandMark size={28} />
          <span>通帳スキャン</span>
        </a>
        <span className="hd-badge" title={c.dev.note}>
          {c.dev.badge}
        </span>
        <nav className="hd-nav" aria-label="main">
          {c.nav.items.map(([id, label]) => (
            <a key={id} href={href(id)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="hd-end">
          <LangSwitch />
          <a className="hd-login" href={DASHBOARD_URL}>
            {c.nav.login}
          </a>
          <a className="btn btn-shu btn-sm" href={DASHBOARD_URL}>
            {c.nav.start}
          </a>
          <button
            ref={btn}
            type="button"
            className="hd-menu"
            aria-expanded={open}
            aria-controls="hd-sheet"
            aria-label={open ? c.nav.close : c.nav.menu}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            id="hd-sheet"
            className="hd-sheet"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
          >
            <nav aria-label="mobile">
              {c.nav.items.map(([id, label]) => (
                <a key={id} href={href(id)} onClick={() => setOpen(false)}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="hd-sheet-end">
              <LangSwitch />
              <a className="hd-login" href={DASHBOARD_URL}>
                {c.nav.login}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

/* ---------------- 検算 ---------------- */

function Verify() {
  const c = useCopy().verify
  const [f0, f1, f2, f3] = c.formula
  return (
    <section className="sec vf" id="verify">
      <div className="wrap">
        <h2 className="h2">
          <Lines lines={c.title} />
        </h2>
        <p className="lead">{c.lead}</p>

        <p className="formula" aria-label={`${f0} − ${f1} ＋ ${f2} ＝ ${f3}`}>
          <span>{f0}</span>
          <i aria-hidden>−</i>
          <span>{f1}</span>
          <i aria-hidden>＋</i>
          <span>{f2}</span>
          <i aria-hidden>＝</i>
          <span className="is-res">
            {f3}
            <span className="dbl" />
          </span>
        </p>
        <p className="vf-caveat">
          <b>{c.caveatTitle}</b>
          {c.caveatBody}
        </p>
        <ExcelBlock />
      </div>
    </section>
  )
}

/* ---------------- Màn hình thật ---------------- */

function ScreenBlock() {
  const c = useCopy().screen
  return (
    <div className="sc" id="screen">
      <h3 className="h2 h2-sm">{c.title[0]}</h3>
      <motion.figure className="sc-fig" initial="off" whileInView="on" viewport={{ once: true, amount: 0.35 }}>
        <div className="sc-shot">
          <Image
            src="/shots/app-light.webp"
            alt={c.alt}
            width={2200}
            height={1375}
            sizes="(max-width: 1400px) 100vw, 1000px"
          />
          {c.marks.map((m, k) => (
            <motion.span
              key={k}
              className="sc-mark"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              variants={{
                off: { opacity: 0, scale: 0.6 },
                on: { opacity: 1, scale: 1, transition: { delay: 0.2 + k * 0.12, duration: 0.28, ease: EASE } },
              }}
            >
              {k + 1}
            </motion.span>
          ))}
        </div>
        <ol className="sc-legend">
          {c.marks.map((m, k) => (
            <li key={k}>
              <b>{k + 1}</b>
              {m.t}
            </li>
          ))}
        </ol>
        <figcaption>{c.caption}</figcaption>
      </motion.figure>
    </div>
  )
}

/* ---------------- Video + các bước ---------------- */

function Film() {
  const c = useCopy().film
  const video = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [failed, setFailed] = useState(false)
  async function play() {
    setFailed(false)
    setStarted(true)
    try {
      await video.current?.play()
    } catch {
      setFailed(true)
    }
  }
  return (
    <section className="sec film" id="film">
      <div className="wrap">
        <h2 className="h2">
          <Lines lines={c.title} />
        </h2>
        <p className="lead">{c.lead}</p>
        <div className={`film-stage ${started ? 'is-started' : ''}`}>
          <video
            ref={video}
            controls={started}
            playsInline
            preload="none"
            poster="/video/gioi-thieu-poster.jpg"
            aria-label={c.title.join('')}
            onPlay={() => setStarted(true)}
            onError={() => started && setFailed(true)}
          >
            <source src="/video/gioi-thieu.mp4" type="video/mp4" />
          </video>
          {!started && (
            <button type="button" className="film-play" onClick={play}>
              <span className="film-play-dot">
                <PlayIcon size={22} />
              </span>
              {c.play}
              <span className="btn-meta">1:27</span>
            </button>
          )}
        </div>
        <p className="film-note">
          {failed ? (
            <>
              {c.failed} <a href="/video/gioi-thieu.mp4">{c.open}</a>
            </>
          ) : (
            c.phone
          )}
        </p>
        <ScreenBlock />
        <div className="steps">
          <h3 className="h3">{c.stepsTitle}</h3>
          <ol>
            {c.steps.map((st, k) => (
              <li key={st.t} title={st.b}>
                <span className="steps-no">{k + 1}</span>
                {st.t}
              </li>
            ))}
          </ol>
          <p className="steps-lead">{c.stepsLead}</p>
        </div>
      </div>
    </section>
  )
}

/* ---------------- 8 đặc điểm của sổ ---------------- */

function Reads() {
  const c = useCopy().reads
  return (
    <section className="sec rd" id="reads">
      <div className="wrap">
        <h2 className="h2">
          <Lines lines={c.title} />
        </h2>
        <p className="lead">{c.lead}</p>
        <figure className="rs">
          <ReadSheet c={c} />
          <ol className="rs-list">
            {c.items.map((it, k) => (
              <li key={it.t}>
                <b className="rs-n">{k + 1}</b>
                <div>
                  <h3>{it.t}</h3>
                  <p>{it.b}</p>
                </div>
              </li>
            ))}
          </ol>
          <figcaption>{c.sampleNote}</figcaption>
        </figure>
        <Formats note={c.banksNote} />
        <ToolsBlock />
      </div>
    </section>
  )
}

/* Trang sổ minh hoạ GỘP tám đặc điểm (ghi rõ là hình giải thích): khung kiểu
 * ゆうちょ (預り trước 支払), năm một chữ số, kana chữ to, dãy số dòng ở lề,
 * dòng ghi tay không phải giao dịch, bảng ký hiệu cuối trang, nếp gấp giữa
 * hai trang, và mép một cuốn sổ khác lọt vào ảnh. Số dư cộng trừ khớp:
 * 140,300 +12,000 → 152,300 −30,000 → 122,300 +45,000 → 167,300 −8,800 → 158,500.
 * Mọi kích thước tính theo bề ngang khung (cqw) nên không cần đo bằng JS. */
type SheetRow = { no: string; date: string; store?: string; inn?: string; out?: string; bal?: string; kana?: boolean; hand?: string }
const SHEET_UP: SheetRow[] = [
  { no: '04', date: '7-04-28', store: '10010', inn: '*12,000', bal: '*152,300' },
  { no: '05', date: '7-04-30', store: '20420', out: '*30,000', bal: '*122,300' },
  { no: '06', date: '7-05-01', store: '30880', inn: '*45,000', bal: '*167,300', kana: true },
]
const SHEET_DOWN: SheetRow[] = [
  { no: '07', date: '7-05-12', store: '10010', out: '*8,800', bal: '*158,500' },
  { no: '08', date: '7-05-20', hand: '新通帳に繰越' },
]

function Mk({ n }: { n: number }) {
  return <span className={`rs-mk rs-mk-${n}`}>{n}</span>
}

function ReadSheet({ c }: { c: V5Copy['reads'] }) {
  const row = (r: SheetRow) => (
    <div key={r.no} className={`rs-row ${r.kana ? 'has-kana' : ''}`}>
      <span className="rs-no">
        {r.no}
        {r.no === '05' && <Mk n={5} />}
      </span>
      <span className="rs-date">
        {r.date}
        {r.no === '05' && <Mk n={4} />}
      </span>
      <span className="rs-store">{r.store}</span>
      <span className="rs-amt">{r.inn}</span>
      <span className="rs-amt">{r.out}</span>
      <span className="rs-amt">{r.bal}</span>
      {r.kana && (
        <span className="rs-kana">
          シンセイフイナンシヤル
          <Mk n={3} />
        </span>
      )}
      {r.hand && (
        <span className="rs-hand">
          {r.hand}
          <Mk n={6} />
        </span>
      )}
    </div>
  )
  return (
    <div className="rs-photo" aria-hidden>
      <div className="rs-other">
        <i />
        <i />
        <i />
        <b>{c.accountB}</b>
        <Mk n={7} />
      </div>
      <div className="rs-page">
        <div className="rs-up">
          <div className="rs-head">
            <span />
            <span>年月日</span>
            <span>取扱店</span>
            <span className="is-in">
              お預り金額
              <Mk n={1} />
            </span>
            <span>お支払金額</span>
            <span>現在高</span>
          </div>
          {SHEET_UP.map(row)}
        </div>
        <div className="rs-fold">
          <span>{c.fold}</span>
          <Mk n={8} />
        </div>
        <div className="rs-down">
          {SHEET_DOWN.map(row)}
          <p className="rs-legend">
            {c.legend}
            <Mk n={2} />
          </p>
        </div>
      </div>
    </div>
  )
}

/* Dải mẫu các kiểu sổ chạy ngang: rê chuột thì dừng, thẻ đang trỏ phóng
 * nhẹ. Nói "sổ đã thử đọc", không phải "đối tác"; chú thích ngay bên dưới. */
function Formats({ note }: { note: string }) {
  const all = useCopy()
  const f = all.formats
  const [stop, setStop] = useState(false)
  return (
    <div className="fm">
      <div className="fm-head">
        <p className="fm-label">{f.label}</p>
        <button type="button" className="fm-toggle" aria-pressed={stop} onClick={() => setStop((v) => !v)}>
          {stop ? <PlayGlyph /> : <PauseGlyph />}
          {stop ? all.nav.play : all.nav.pause}
        </button>
      </div>
      <div className={`fm-view ${stop ? 'is-stopped' : ''}`}>
        <ul className="fm-track">
          {[...f.items, ...f.items].map((it, k) => (
            <li key={k} className="fm-card" aria-hidden={k >= f.items.length || undefined}>
              <span className="fm-sample">{it.sample}</span>
              <span className="fm-note">{it.note}</span>
              <b>{it.bank}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="banks-note">{note}</p>
    </div>
  )
}

/* ---------------- Công cụ chỉnh ảnh ---------------- */

function ToolsBlock() {
  const all = useCopy()
  return (
    <div className="tl" id="tools">
      <h3 className="h2 h2-sm">
        <Lines lines={all.tools.title} />
      </h3>
      <ToolDemo c={all} />
    </div>
  )
}

/* ---------------- Excel ---------------- */

type XRow = {
  n: number
  cells: (string | number | undefined)[]
  cls?: string
  fill?: Record<number, 'warn' | 'fix'>
}

function ExcelBlock() {
  const c = useCopy().excel
  const s = c.sheet
  const [saved, setSaved] = useState(false)
  const rows: XRow[] = [
    { n: 6, cells: [s.level, s.levelV, undefined, undefined, undefined, '取引 8行 / 残高検算OK 7行 / 自動修正 1行 / 要確認 1行'], cls: 'is-level' },
    { n: 7, cells: [] },
    { n: 8, cells: ['年月日', '区分', '摘要', 'お支払金額', 'お預り金額', '差引残高', '残高チェック', '確認メモ'], cls: 'is-head' },
    { n: 9, cells: ['2025-03-21', 'R', 'サリユスクエアカイヒ', 2750, undefined, 25024, '―'] },
    { n: 10, cells: ['2025-03-21', 'R', '手数料 サリユステーシヨン', 1100, undefined, 23924, 'OK'] },
    { n: 11, cells: ['2025-03-31', 'L', '振込2 カ）ヨンデンコウ', undefined, 58300, 82224, 'OK'] },
    { n: 12, cells: ['2025-03-31', 'K', '松下水道', undefined, 290950, 373174, 'OK', '金額を入金列へ移動'], fill: { 4: 'fix' }, cls: 'is-sel' },
    { n: 13, cells: ['2025-03-31', 'Q', '', 350000, undefined, 23174, 'OK'] },
    { n: 14, cells: ['2025-04-01', 'L', '振込1 カ）トクシマセツケイコウ', undefined, 4224150, 4247324, 'OK', '摘要を原本と照合'], fill: { 2: 'warn' } },
    { n: 15, cells: ['2025-04-01', 'Q', '', 3700000, undefined, 547324, 'OK'] },
    { n: 16, cells: ['2025-04-01', 'R', 'ご融資利息', 2835, undefined, 544489, 'OK'] },
    { n: 17, cells: ['2025-04-10', '', '新通帳に繰越', undefined, undefined, undefined, '―'], cls: 'is-note' },
  ]
  function download() {
    const head = ['年月日', '区分', '摘要', 'お支払金額', 'お預り金額', '差引残高']
    const lines = SAMPLE_ROWS.map((r) =>
      [
        '20' + (Number(r.date.slice(0, 2)) + 18) + r.date.slice(2),
        r.kind,
        [r.desc, r.payee].filter(Boolean).join(' '),
        r.out ?? '',
        r.in ?? '',
        r.note ? '' : r.balance,
      ].join(','),
    )
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tsucho-scan-sample.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    setSaved(true)
  }
  return (
    <div className="xl" id="excel">
      <h3 className="h2 h2-sm">
        <Lines lines={c.title} />
      </h3>
      <div className="xl-grid">
        <div className="sheet" aria-hidden>
          <div className="sheet-bar">
            <span className="sheet-ref">G12</span>
            <span className="sheet-fx">fx</span>
            <code>=IF(F12=F11-N(D12)+N(E12),&quot;OK&quot;,&quot;NG&quot;)</code>
          </div>
          <div className="sheet-grid">
            <div className="sheet-row is-cols">
              <span />
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.n} className={`sheet-row ${r.cls ?? ''}`}>
                <span className="sheet-n">{r.n}</span>
                {Array.from({ length: 8 }).map((_, k) => {
                  const v = r.cells[k]
                  const f = r.fill?.[k]
                  const isNum = typeof v === 'number'
                  return (
                    <span
                      key={k}
                      className={[
                        isNum ? 'num' : '',
                        f ? `cell-${f}` : '',
                        r.cls === 'is-sel' && k === 6 ? 'is-cursor' : '',
                        k === 6 && v === 'OK' ? 'is-ok' : '',
                      ].join(' ')}
                    >
                      {isNum ? yen(v as number) : v}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="sheet-tabs">
            {s.tabs.map((t, k) => (
              <span key={t} className={k === 0 ? 'is-on' : ''}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="xl-side">
          <ul className="xl-points">
            {c.points.map((p) => (
              <li key={p.t}>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-line" onClick={download}>
            <DownloadIcon />
            {saved ? c.downloaded : c.download}
          </button>
          <p className="fine">{c.sampleNote}</p>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Độ chính xác ---------------- */

function Limits() {
  const c = useCopy().limits
  return (
    <section className="sec lm" id="limits">
      <div className="wrap">
        <h2 className="h2">
          <Lines lines={c.title} />
        </h2>
        <p className="lead">{c.lead}</p>
        <div className="lm-figs">
          {c.rows.map((r) => {
            const [lo, hi] = r.u ? r.v.split('〜').map(Number) : [0, 0]
            return (
              <div key={r.m} className="lm-fig">
                <p className="lm-m">{r.m}</p>
                <p className={`lm-v ${r.u ? '' : 'is-text'}`}>
                  {r.v}
                  {r.u && <small>{r.u}</small>}
                </p>
                {r.u && (
                  <span className="lm-range" aria-hidden>
                    <i style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                    <b className="is-0">0</b>
                    <b className="is-50">50</b>
                    <b className="is-100">100</b>
                  </span>
                )}
                <p className="lm-n">{r.n}</p>
              </div>
            )
          })}
        </div>
        <p className="fine">{c.measured}</p>
        <div className="lm-two">
          <div>
            <h3 className="h3">{c.notDoTitle}</h3>
            <ul className="lm-not">
              {c.notDo.map((x) => (
                <li key={x}>
                  <CrossIcon size={16} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <DataHandling />
        </div>
      </div>
    </section>
  )
}

/* Những gì đã nói trên trang đang chạy, không thêm lời hứa mới; không ghi
 * tên dịch vụ AI (theo ý người dùng 27/10). */
function DataHandling() {
  const d = useCopy().data
  return (
    <div className="dh" id="data">
      <h3 className="h3">{d.title}</h3>
      <dl>
        {d.items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* ---------------- Giá ---------------- */

function Pricing() {
  const c = useCopy().pricing
  const rows: { label: string; get: (k: number) => string }[] = [
    { label: c.rows[0], get: (k) => c.plans[k].who },
    { label: c.rows[1], get: (k) => c.plans[k].pages },
    { label: c.rows[2], get: (k) => c.plans[k].per },
    { label: c.rows[3], get: (k) => c.plans[k].keep },
  ]
  return (
    <section className="sec pr" id="pricing">
      <div className="wrap">
        <h2 className="h2">
          <Lines lines={c.title} />
        </h2>
        <p className="lead">{c.lead}</p>
        <div className="rate" role="table" aria-label={c.title.join('')}>
          <div className="rate-row rate-top" role="row">
            <span role="columnheader" className="rate-label">
              <span className="badge">{c.badge}</span>
            </span>
            {c.plans.map((p, k) => (
              <div key={p.name} role="columnheader" className={`rate-plan ${k === 1 ? 'is-best' : ''}`}>
                {k === 1 && <span className="rate-best">{c.best}</span>}
                <span className="rate-name">{p.name}</span>
                <span className="rate-price">
                  {p.price}
                  <small>{c.perMonth}</small>
                </span>
              </div>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.label} className="rate-row" role="row">
              <span role="rowheader" className="rate-label">
                {r.label}
              </span>
              {c.plans.map((p, k) => (
                <span key={p.name} role="cell" className={k === 1 ? 'is-best' : ''}>
                  <span className="rate-mlabel">{r.label}</span>
                  {r.get(k)}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="rate-cards">
          {c.plans.map((p, k) => (
            <article key={p.name} className={`rate-card ${k === 1 ? 'is-best' : ''}`}>
              {k === 1 && <span className="rate-best">{c.best}</span>}
              <h3 className="rate-name">{p.name}</h3>
              <p className="rate-price">
                {p.price}
                <small>{c.perMonth}</small>
              </p>
              <dl>
                {rows.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.get(k)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
          <p className="badge">{c.badge}</p>
        </div>
        <FaqBlock />
        <div className="pr-foot">
          <div className="pr-notes">
            <p>{c.ask}</p>
            <p className="fine">{c.unit}</p>
            <p className="fine">{c.note}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- Hỏi đáp (nằm trong mục 精度) ---------------- */

/* Chỉ giữ câu hỏi chưa được trả lời ở chỗ khác trên trang
 * (ngân hàng → dải mẫu sổ; ảnh đi đâu → データの扱い). */
const FAQ_KEEP = [1, 2, 4, 5]

function FaqBlock() {
  const c = useCopy().faq
  return (
    <div className="fq" id="faq">
      <h3 className="h2 h2-sm">{c.title[0]}</h3>
      <div className="fq-list">
        {FAQ_KEEP.map((k) => c.items[k]).map((it) => (
          <details key={it.q}>
            <summary>
              <span>{it.q}</span>
              <PlusIcon />
            </summary>
            <p>{it.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Lời mời cuối ---------------- */

function Final() {
  const c = useCopy()
  const demo = useDemo()
  return (
    <section className="sec fin">
      <div className="fin-rosette" aria-hidden>
        <Rosette size={900} />
      </div>
      <div className="wrap fin-in">
        <h2 className="h2 h2-xl">
          <Lines lines={c.cta.title} />
        </h2>
        <p className="lead">{c.cta.lead}</p>
        <div className="fin-act">
          <a className="btn btn-shu btn-lg" href={DASHBOARD_URL}>
            {c.nav.start}
            <ArrowIcon />
          </a>
          <button type="button" className="btn btn-line btn-lg" onClick={() => demo('contact')}>
            {c.contact.title}
          </button>
        </div>
        <p className="fin-safe">
          {c.cta.safe} <a href="#data">{c.cta.safeLink}</a>
        </p>
        <motion.div
          className="fin-seal"
          initial={{ opacity: 0, scale: 1.35, rotate: -14 }}
          whileInView={{ opacity: 1, scale: 1, rotate: -9 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.38, ease: EASE, delay: 0.25 }}
        >
          <Seal text={c.story.seal} size={150} />
        </motion.div>
      </div>
    </section>
  )
}

/* Chân trang = TRANG CUỐI của cuốn sổ: giấy có hoa văn, khung in bằng mực
 * biểu mẫu, mỗi cột link kẻ chấm như dòng sổ, lời "đang phát triển" in theo
 * lối chú thích ※ ở cuối sổ thật. Không còn dải tối kiểu web chung. */
function Footer() {
  const c = useCopy()
  const demo = useDemo()
  return (
    <footer className="ft">
      <div className="wrap">
        <div className="ft-head">
          <span className="brand">
            <BrandMark size={30} />
            <span>通帳スキャン</span>
            <span className="hd-badge">{c.dev.badge}</span>
          </span>
          <p className="ft-tag">{c.footer.tagline}</p>
          <a className="btn btn-shu btn-sm" href={DASHBOARD_URL}>
            {c.nav.start}
            <ArrowIcon size={16} />
          </a>
        </div>
        <div className="ft-log" id="news">
          <h3>{c.news.title[0]}</h3>
          <p>{c.news.lead}</p>
          <ol>
            {c.news.items.slice(0, 4).map((it, k) => (
              <li key={k}>
                <time dateTime={it.d.replaceAll('.', '-')}>{it.d}</time>
                <span className="nw-tag">{it.tag}</span>
                <span className="ft-log-t">{it.t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="ft-form">
          {c.foot.cols.map((col) => (
            <nav key={col.h} aria-label={col.h} className="ft-col">
              <h3>{col.h}</h3>
              <ul>
                {col.links.map(([label, to]) => (
                  <li key={label}>
                    {to.startsWith('#') ? (
                      <a href={to}>{label}</a>
                    ) : (
                      <button type="button" onClick={() => demo(to === 'contact' ? 'contact' : 'page')}>
                        {label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="ft-dev">
          <span aria-hidden>※</span>
          {c.dev.note}
        </p>
        <div className="ft-bottom">
          <p>© 2026 {c.footer.rights}</p>
          <p className="ft-ver">{c.foot.version}</p>
          <LangSwitch />
        </div>
      </div>
    </footer>
  )
}
