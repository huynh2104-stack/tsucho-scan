'use client'

/* BỐN CÔNG CỤ CHỈNH ẢNH, diễn bằng chuyển động.
 *
 * Một "mặt bàn" có tấm ảnh trang sổ; mỗi công cụ diễn một lần (~3,4 giây):
 *   台形補正  ảnh chụp chếch → kéo bốn góc → phẳng
 *   切り抜き  ảnh dính cả bìa sổ → khung cắt thu về đúng trang
 *   回転      ảnh nằm ngang → xoay 90° → còn nghiêng 3° → chỉnh từng độ về 0°
 *   明るさ    ảnh bạc màu, có bóng → kéo thanh trượt → rõ chữ
 * Thanh tiến độ dưới công cụ đang diễn quyết định lúc chuyển sang công cụ kế
 * (hết hoạt ảnh CSS là chuyển). Rê chuột / đặt tiêu điểm vào thì dừng, ra
 * khỏi màn hình cũng dừng. Có nút dừng/chạy cho người dùng cảm ứng và bàn
 * phím (WCAG 2.2.2), và người dùng tự chọn một công cụ thì ngừng tự chuyển.
 * Giảm chuyển động: chỉ hiện trạng thái sau khi chỉnh.
 */

import { motion, useInView, useMotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { V5Copy } from '@/lib/v5-copy'
import { Passbook } from './story'

const RUN = 3.4
const PAGE = { w: 520, h: 514 }

function useReduced() {
  const [r, setR] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}

export function ToolDemo({ c }: { c: V5Copy }) {
  const items = c.tools.items
  const [k, setK] = useState(0)
  const [run, setRun] = useState(0)
  const [hold, setHold] = useState(false)
  const [auto, setAuto] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const inView = useInView(root, { amount: 0.4 })
  const reduce = useReduced()
  const paused = hold || !inView || !auto

  const show = (i: number) => {
    setK(i)
    setRun((r) => r + 1)
  }
  /* Người dùng tự chọn: họ đã cầm lái, đừng tự chuyển đi nữa. */
  const pick = (i: number) => {
    setAuto(false)
    show(i)
  }
  const next = () => show((k + 1) % items.length)
  const toggle = () => {
    setAuto((a) => !a)
    setRun((r) => r + 1)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const i = (k + d + items.length) % items.length
    pick(i)
    root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus()
  }

  return (
    <div
      ref={root}
      className={`td ${paused ? 'is-paused' : ''}`}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      <div className="td-list" role="tablist" aria-orientation="vertical" onKeyDown={onKey}>
        {items.map((it, i) => (
          <button
            key={it.t}
            type="button"
            role="tab"
            id={`td-tab-${i}`}
            aria-selected={i === k}
            aria-controls="td-panel"
            tabIndex={i === k ? 0 : -1}
            className={`td-tab ${i === k ? 'is-on' : ''}`}
            onClick={() => pick(i)}
          >
            <span className="td-t">{it.t}</span>
            <span className="td-b">{it.b}</span>
            {i === k && !reduce && auto && <span key={run} className="td-bar" onAnimationEnd={next} />}
          </button>
        ))}
      </div>
      <div className="td-side">
        <Stage id="td-panel" label={items[k].t} tabId={`td-tab-${k}`} text={items[k].b}>
          {(s) => <Scene key={`${k}-${run}`} tool={k} c={c} s={s} still={reduce} />}
        </Stage>
        {!reduce && (
          <button type="button" className="td-toggle" aria-pressed={!auto} onClick={toggle}>
            {auto ? <PauseGlyph /> : <PlayGlyph />}
            {auto ? c.nav.pause : c.nav.play}
          </button>
        )}
        <p className="td-desc" aria-hidden>
          {items[k].b}
        </p>
      </div>
    </div>
  )
}

export function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="ic">
      <path d="M8 5.5v13M16 5.5v13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="ic">
      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  )
}

function RotateGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className="ic">
      <path
        d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Stage({
  id,
  label,
  tabId,
  text,
  children,
}: {
  id: string
  label: string
  tabId: string
  text: string
  children: (s: number) => React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [s, setS] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const m = () => setS(Math.min((el.clientWidth * 0.68) / PAGE.w, (el.clientHeight * 0.72) / PAGE.h))
    m()
    const ro = new ResizeObserver(m)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="td-stage" id={id} role="tabpanel" aria-labelledby={tabId} aria-label={label}>
      <p className="sr-only">{text}</p>
      <div className="td-vis" aria-hidden>
        {s > 0 && children(s)}
      </div>
    </div>
  )
}

/* Trả về chuỗi khung hình khi chạy, hoặc đúng khung cuối khi đứng yên. */
const kf = <T,>(still: boolean, arr: T[]) => (still ? arr[arr.length - 1] : arr)

function Scene({ tool, c, s, still }: { tool: number; c: V5Copy; s: number; still: boolean }) {
  const p0 = useMotionValue(0)
  const page = <Passbook c={c} p={p0} printed reduce />
  const t = (times: number[]) => (still ? { duration: 0 } : { duration: RUN, times, ease: 'easeInOut' as const })

  if (tool === 0) {
    const T = t([0, 0.22, 0.72, 1])
    return (
      <Center s={s}>
        <motion.div className="td-target" initial={still ? false : undefined} animate={{ opacity: kf(still, [0, 0.9, 0.9, 0]) }} transition={T} />
        <motion.div
          className="td-photo"
          style={{ transformPerspective: 1000 }}
          initial={still ? false : undefined}
          animate={{
            rotateX: kf(still, [30, 30, 0, 0]),
            rotateZ: kf(still, [-6, -6, 0, 0]),
            scale: kf(still, [0.84, 0.84, 1, 1]),
            y: kf(still, [26, 26, 0, 0]),
          }}
          transition={T}
        >
          {page}
          {['tl', 'tr', 'bl', 'br'].map((h) => (
            <motion.span
              key={h}
              className={`td-handle is-${h}`}
              initial={still ? false : undefined}
              animate={{ opacity: kf(still, [0, 1, 1, 0]), scale: kf(still, [0.6, 1, 1, 0.8]) }}
              transition={still ? { duration: 0 } : { duration: RUN, times: [0, 0.14, 0.8, 1] }}
            />
          ))}
        </motion.div>
      </Center>
    )
  }

  if (tool === 1) {
    const T = t([0, 0.2, 0.68, 1])
    return (
      <Center s={s}>
        <motion.div className="td-photo" initial={still ? false : undefined} animate={{ y: kf(still, [70, 70, 30, 30]) }} transition={T}>
          <div className="td-cover">
            <span>普通預金通帳</span>
          </div>
          <div className="td-margin" />
          {page}
        </motion.div>
        <motion.div
          className="td-crop"
          style={{ originY: 1 }}
          initial={still ? false : undefined}
          animate={{
            opacity: kf(still, [0, 1, 1, 1]),
            scaleX: kf(still, [1.16, 1.16, 1, 1]),
            scaleY: kf(still, [1.5, 1.5, 1, 1]),
            y: kf(still, [70, 70, 30, 30]),
          }}
          transition={T}
        >
          <i className="is-tl" />
          <i className="is-tr" />
          <i className="is-bl" />
          <i className="is-br" />
        </motion.div>
      </Center>
    )
  }

  if (tool === 2) {
    const times = [0, 0.18, 0.42, 0.58, 0.82, 1]
    const T = t(times)
    const label = (o: number[]) => ({
      initial: still ? (false as const) : undefined,
      animate: { opacity: kf(still, o) },
      transition: T,
    })
    return (
      <>
        <Center s={s}>
          <motion.div
            className="td-photo"
            initial={still ? false : undefined}
            animate={{ rotate: kf(still, [-93, -93, -3, -3, 0, 0]), scale: kf(still, [0.8, 0.8, 1, 1, 1, 1]) }}
            transition={T}
          >
            {page}
          </motion.div>
        </Center>
        <div className="td-readout" aria-hidden>
          <motion.span {...label([1, 1, 0, 0, 0, 0])}>
            <RotateGlyph />
            90°
          </motion.span>
          <motion.span {...label([0, 0, 1, 1, 0, 0])}>−3°</motion.span>
          <motion.span {...label([0, 0, 0, 0, 1, 1])}>0°</motion.span>
        </div>
      </>
    )
  }

  const T = t([0, 0.2, 0.72, 1])
  return (
    <>
      <Center s={s}>
        <motion.div
          className="td-photo"
          initial={still ? false : undefined}
          animate={{
            filter: kf(still, [
              'brightness(1.5) contrast(0.42)',
              'brightness(1.5) contrast(0.42)',
              'brightness(1) contrast(1)',
              'brightness(1) contrast(1)',
            ]),
          }}
          transition={T}
        >
          {page}
          <motion.span className="td-shade" initial={still ? false : undefined} animate={{ opacity: kf(still, [0.75, 0.75, 0.12, 0.12]) }} transition={T} />
        </motion.div>
      </Center>
      <div className="td-sliders" aria-hidden>
        <Slider icon="sun" from="-36%" T={T} still={still} />
        <Slider icon="half" from="-28%" T={T} still={still} />
      </div>
    </>
  )
}

function Center({ s, children }: { s: number; children: React.ReactNode }) {
  return (
    <div className="td-center" style={{ width: PAGE.w, height: PAGE.h, transform: `translate(-50%, -50%) scale(${s})` }}>
      {children}
    </div>
  )
}

function Slider({
  icon,
  from,
  T,
  still,
}: {
  icon: 'sun' | 'half'
  from: string
  T: object
  still: boolean
}) {
  return (
    <div className="td-sl">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="ic">
        {icon === 'sun' ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </g>
        ) : (
          <g>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
          </g>
        )}
      </svg>
      <div className="td-track">
        <motion.span className="td-thumbwrap" initial={still ? false : undefined} animate={{ x: kf(still, [from, from, '0%', '0%']) }} transition={T}>
          <i />
        </motion.span>
      </div>
    </div>
  )
}
