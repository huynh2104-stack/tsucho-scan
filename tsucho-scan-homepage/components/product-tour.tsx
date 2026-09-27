'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useI18n } from '@/lib/i18n'
import { EASE_OUT } from '@/lib/motion'

const shots = ['step-1-import', 'step-2-straighten', 'step-3-scan', 'step-4-fix', 'step-5-export']
const copy = {
  jp: { label: '操作をプレビュー', next: '次の操作', previous: '前の操作', note: '実際の画面を使った操作ガイドです。ここではファイルは送信されません。' },
  vn: { label: 'Xem trước thao tác', next: 'Bước tiếp theo', previous: 'Bước trước', note: 'Hướng dẫn bằng ảnh chụp ứng dụng thực tế. Không gửi tệp ở phần xem trước này.' },
  en: { label: 'Preview the workflow', next: 'Next step', previous: 'Previous step', note: 'A walkthrough with real application screenshots. No files are sent in this preview.' },
}

export function ProductTour() {
  const { t, lang } = useI18n()
  const [active, setActive] = useState(0)
  const reduced = useReducedMotion()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const c = copy[lang]
  const step = t.how.steps[active]

  return (
    <div className="product-tour">
      <div className="tour-tabs" role="tablist" aria-label={c.label}>
        {t.how.steps.map((s, i) => (
          <button
            key={i} ref={el => { tabs.current[i] = el }} type="button" role="tab"
            id={`tour-tab-${i}`} aria-controls="tour-panel" aria-selected={active === i}
            tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)}
            onKeyDown={e => {
              const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
              if (!keys.includes(e.key)) return
              e.preventDefault()
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? 4 : (active + (e.key === 'ArrowRight' ? 1 : 4)) % 5
              setActive(next)
              tabs.current[next]?.focus()
            }}
          >
            <span className="tour-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
      <div className="tour-panel" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${active}`} tabIndex={0}>
        <div className="tour-description">
          <span className="tour-count" aria-hidden="true">{String(active + 1).padStart(2, '0')} <span>/ 05</span></span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <div className="tour-controls">
            <button type="button" disabled={active === 0} onClick={() => setActive(active - 1)} aria-label={c.previous}>←</button>
            <button type="button" disabled={active === 4} onClick={() => setActive(active + 1)}>{c.next}<span aria-hidden="true"> →</span></button>
          </div>
        </div>
        <div className="tour-stage">
          <motion.div key={active} className="tour-image" initial={reduced ? false : { opacity: 0.5, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36, ease: EASE_OUT }}>
            <Image src={`/shots/${shots[active]}.webp`} alt={step.title} width={active === 4 ? 1060 : 1120} height={active === 4 ? 1264 : 700} sizes="(max-width: 760px) 92vw, 760px" className="tour-shot" />
          </motion.div>
        </div>
      </div>
      <p className="tour-note">{c.note}</p>
    </div>
  )
}
