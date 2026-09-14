'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { Reveal } from '@/lib/motion'

/** Ảnh chụp thật, ĐỘ PHÂN GIẢI GỐC (ảnh chụp gấp đôi). Thứ tự khớp `how.steps`.
 *  w/h là kích thước điểm ảnh thật của file — khung giữ đúng tỉ lệ đó. */
const ANH = [
  { src: '/shots/step-1-import.webp', w: 1120, h: 700 },
  { src: '/shots/step-2-straighten.webp', w: 1120, h: 700 },
  { src: '/shots/step-3-scan.webp', w: 1200, h: 750 },
  { src: '/shots/step-4-fix.webp', w: 1120, h: 700 },
  /* Bước 05 là TRỌN hộp thoại xuất file (khổ dọc). Hiện hẹp hơn một chút
     để hàng không quá cao — vẫn ≈0,9 lần cỡ chữ thật trên màn QHD. */
  { src: '/shots/step-5-export.webp', w: 1060, h: 1264, hep: true },
]

/* 進め方 — năm bước xếp dọc, mỗi bước TỰ ĐỦ NGHĨA.
 *
 * Bản trước là "cuộn thì khung ảnh dính đổi ảnh": chủ sản phẩm thấy người
 * vào lần đầu không hiểu mình đang ở bước nào. Còn có lỗi thật: năm ảnh nằm
 * trong từng bước (ẩn trên máy tính) CỘNG năm ảnh nữa trong khung dính —
 * mười ảnh, phần lớn không tải. Nay chỉ còn một bộ ảnh, mỗi ảnh nằm ngay
 * cạnh chữ của bước đó; lướt qua là hiểu "bước 1, 2, 3…".
 *
 * Bước nào đang ở giữa khung nhìn thì sáng lên: lằn son trái, số màu son,
 * và một lớp son rất nhạt loang từ trái sang phải rồi tan (CSS `.how-row`).
 * Đây chỉ là dấu định vị — không có gì đổi chỗ, không có gì phải học.
 *
 * Ảnh: `object-contain` trong khung đúng tỉ lệ file, không cắt chữ. Cấu
 * hình để `images.unoptimized` nên trình duyệt nhận nguyên file gốc.
 */
export function HowSteps() {
  const { t } = useI18n()
  const buoc = t.how.steps
  const [dang, setDang] = useState(-1)
  const refs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    /* Dải hẹp 10% ngang giữa khung nhìn. Bước nào chạm dải là bước đang xem.
       Nằm giữa hai bước (không bước nào chạm) thì GIỮ bước cũ — không nháy. */
    const io = new IntersectionObserver(
      (muc) => {
        for (const m of muc) {
          if (!m.isIntersecting) continue
          const i = refs.current.indexOf(m.target as HTMLLIElement)
          if (i >= 0) setDang(i)
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <ol className="m-0 list-none border-t border-rule p-0">
      {buoc.map((s, i) => {
        const sang = dang === i
        const a = ANH[i]
        return (
          <li
            key={s.title}
            ref={(el) => {
              refs.current[i] = el
            }}
            data-active={sang}
            aria-current={sang ? 'step' : undefined}
            className="how-row grid gap-6 border-b border-rule py-8 pr-1 pl-4 sm:pl-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-center lg:gap-12 lg:py-9"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <span
                  className={`how-num tnum shrink-0 text-[13px] font-medium ${
                    sang ? 'text-shu' : 'text-sumi-2'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="font-display text-[19px] leading-snug font-semibold text-sumi">
                  {s.title}
                </h3>
              </div>
              <p className="m-0 mt-2.5 max-w-[40ch] pl-[2.15rem] text-[14.5px] leading-[1.85] text-sumi-2">
                {s.body}
              </p>
            </div>

            <Reveal className={a.hep ? 'w-full lg:max-w-[480px] lg:justify-self-end' : 'w-full'}>
              <figure className="khung-anh m-0">
                <Image
                  src={a.src}
                  alt={s.title}
                  width={a.w}
                  height={a.h}
                  quality={90}
                  sizes="(min-width:1024px) 560px, 100vw"
                  className="block h-auto w-full rounded-[4px] object-contain"
                />
              </figure>
            </Reveal>
          </li>
        )
      })}
    </ol>
  )
}
