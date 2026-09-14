'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'

/** Ảnh chụp thật cho từng bước, cùng tỉ lệ 4:3. Thứ tự khớp `how.steps`. */
const ANH = [
  '/shots/step-1-import.webp',
  '/shots/step-2-straighten.webp',
  '/shots/step-3-scan.webp',
  '/shots/step-4-fix.webp',
  '/shots/step-5-export.webp',
]

/* 進め方 — MỘT khung ảnh đứng yên, năm bước chạy qua bên cạnh.
 *
 * Bản trước mỗi bước một ảnh to, xếp so le: section cao ~2.250px, cuộn
 * qua thấy từng mảng trống như trang lỗi. Nay trên máy tính ảnh DÍNH ở
 * cột phải (top = header + 16px), cột trái là danh sách 01–05; bước nào
 * đang nằm ngang giữa khung nhìn thì sáng lên và ảnh đổi theo.
 *
 * Cả năm ảnh luôn nằm trong DOM, chồng lên nhau; chỉ đổi mờ-tỏ + trượt
 * 12px. Không gỡ ra gắn vào nên khung không bao giờ nhảy.
 *
 * Dưới 1024px bỏ dính: mỗi bước chữ + ảnh xếp dọc như bình thường.
 */
export function HowSteps() {
  const { t } = useI18n()
  const buoc = t.how.steps
  const [dang, setDang] = useState(0)
  const refs = useRef<(HTMLLIElement | null)[]>([])

  /* Bước đang đọc = bước CUỐI CÙNG có mép trên đã vượt qua đường 40% chiều
     cao khung nhìn. Dùng một đường thay vì dải + IntersectionObserver: dải
     có thể chạm hai bước cùng lúc và nhảy cóc qua bước 1; còn "bước cuối
     đã qua đường" thì luôn tăng dần đều 0 → 1 → … → 4 khi cuộn xuống. */
  useEffect(() => {
    let khung = 0
    const tinh = () => {
      khung = 0
      const duong = window.innerHeight * 0.4
      let i = 0
      refs.current.forEach((el, k) => {
        if (el && el.getBoundingClientRect().top <= duong) i = k
      })
      setDang((cu) => (cu === i ? cu : i))
    }
    const hen = () => {
      if (!khung) khung = requestAnimationFrame(tinh)
    }
    tinh()
    window.addEventListener('scroll', hen, { passive: true })
    window.addEventListener('resize', hen)
    return () => {
      window.removeEventListener('scroll', hen)
      window.removeEventListener('resize', hen)
      cancelAnimationFrame(khung)
    }
  }, [])

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
      <ol className="m-0 list-none border-t border-rule p-0">
        {buoc.map((s, i) => {
          const sang = dang === i
          return (
            <li
              key={s.title}
              ref={(el) => {
                refs.current[i] = el
              }}
              aria-current={sang ? 'step' : undefined}
              className={`how-step border-b border-rule py-6 lg:flex lg:min-h-[11.5rem] lg:flex-col lg:justify-center lg:border-l-2 lg:py-7 lg:pl-5 ${
                sang ? 'lg:border-l-shu' : 'lg:border-l-transparent'
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className={`how-step tnum shrink-0 text-[12px] ${
                    sang ? 'lg:text-shu' : 'lg:text-sumi-2'
                  } text-beni`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="font-display text-[17px] font-semibold text-sumi">{s.title}</h3>
              </div>
              <p className="m-0 mt-2 max-w-[44ch] pl-[2.1rem] text-[14px] leading-[1.8] text-sumi-2">
                {s.body}
              </p>

              {/* Dưới 1024px: ảnh nằm ngay dưới chữ của bước đó */}
              <figure className="khung-anh m-0 mt-5 lg:hidden">
                <Image
                  src={ANH[i]}
                  alt={s.title}
                  width={880}
                  height={660}
                  sizes="(max-width: 1024px) 92vw, 1px"
                  className="block h-auto w-full rounded-[4px]"
                />
              </figure>
            </li>
          )
        })}
      </ol>

      {/* Máy tính: một khung dính, năm ảnh chồng lên nhau */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(var(--header-h)+16px)]">
          <figure className="khung-anh m-0">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[4px] bg-paper-3">
              {buoc.map((s, i) => (
                <Image
                  key={s.title}
                  src={ANH[i]}
                  alt={dang === i ? s.title : ''}
                  aria-hidden={dang !== i}
                  data-active={dang === i}
                  fill
                  sizes="(min-width: 1024px) 600px, 1px"
                  className="how-shot object-cover"
                  priority={i === 0}
                />
              ))}
            </div>
            <figcaption className="flex items-baseline gap-2 px-1 pt-2.5 text-[12.5px] text-sumi-2">
              <span className="tnum text-shu">
                {String(dang + 1).padStart(2, '0')} / {String(buoc.length).padStart(2, '0')}
              </span>
              <span className="truncate">{buoc[dang].title}</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  )
}
