'use client'

import { useId, useState } from 'react'
import { useI18n } from '@/lib/i18n'

/* HỎI ĐÁP — accordion bằng <button>, không phải <details>.
 *
 * <details> đóng là `display:none`, nên không làm hoạt ảnh mở ra được.
 * Ở đây phần trả lời luôn nằm trong DOM, gập bằng grid-template-rows
 * 0fr → 1fr (CSS `.faq-panel`), chiều cao chạy mượt mà không phải đo.
 *
 * Mở câu này không đóng câu khác — người đọc hay so hai câu trả lời.
 * Enter / Space là hành vi sẵn có của <button>. Khi gập, phần trả lời
 * được đánh dấu `inert` để phím Tab không lọt vào chữ đang ẩn.
 *
 * Không có JavaScript: `<noscript>` trong layout mở hết mọi câu.
 */
export function Faq() {
  const { t } = useI18n()
  const f = t.faq
  const goc = useId()
  const [mo, setMo] = useState<Set<number>>(new Set())

  const doi = (i: number) =>
    setMo((cu) => {
      const moi = new Set(cu)
      if (moi.has(i)) moi.delete(i)
      else moi.add(i)
      return moi
    })

  return (
    <div className="border-t border-rule">
      {f.items.map((it, i) => {
        const dangMo = mo.has(i)
        const nut = `${goc}-q${i}`
        const vung = `${goc}-a${i}`
        return (
          <div key={it.q} className="border-b border-rule">
            <h3 className="m-0">
              <button
                id={nut}
                type="button"
                aria-expanded={dangMo}
                aria-controls={vung}
                onClick={() => doi(i)}
                className="flex w-full cursor-pointer items-baseline gap-3 py-4 text-left text-[14.5px] font-medium text-sumi transition-colors duration-200 hover:text-shu"
              >
                <span aria-hidden className="faq-mark mt-[2px] shrink-0 text-[13px] text-shu">
                  ＋
                </span>
                <span className="max-w-[58ch]">{it.q}</span>
              </button>
            </h3>
            <div
              id={vung}
              role="region"
              aria-labelledby={nut}
              data-faq-panel
              data-open={dangMo}
              className="faq-panel"
            >
              <div inert={!dangMo}>
                <p className="m-0 max-w-[64ch] pb-5 pl-[1.6rem] text-[13.5px] leading-[1.8] text-sumi-2">
                  {it.a}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
