'use client'

import Image from 'next/image'
import { motion } from 'motion/react'
import { useI18n } from '@/lib/i18n'
import { EASE_OUT, T_BASE } from '@/lib/motion'

/* MÀN HÌNH LÀM VIỆC — ảnh chụp thật, đặt trong khung giấy.
 *
 * Bản trước đặt ảnh NỀN TỐI trong một khung laptop vẽ bằng CSS: viền xanh
 * bạc hà của ứng dụng lệch hẳn tông giấy/mực/son của trang, và chiếc máy
 * vẽ tay làm ảnh thật trông kém thật. Nay dùng ảnh NỀN SÁNG của cùng màn
 * hình (cùng bố cục, cùng dữ liệu) trên một tờ giấy lót — `.khung-anh`,
 * cũng là khung của ảnh các bước ở #how.
 *
 * Không vẽ thêm giao diện giả nào. Ba dấu chỉ trỏ vào thứ CÓ THẬT trong
 * ảnh; toạ độ tính theo % của ảnh 16:10.
 *
 * Tên pháp nhân trong ảnh là TÊN MẪU do script chụp thay vào (xem
 * tools/chup-anh-man-hinh.py) — dữ liệu phát triển là sổ khách hàng thật.
 */
export function ManHinh() {
  const { t } = useI18n()
  const a = t.app

  return (
    <div className="mx-auto w-full max-w-[56rem]">
      <figure className="khung-anh m-0">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[4px] bg-paper-3">
          <Image
            src="/shots/app-light.webp"
            alt={a.shotAlt}
            width={2200}
            height={1375}
            sizes="(max-width: 640px) 94vw, (max-width: 1024px) 90vw, 880px"
            className="h-full w-full object-cover object-top"
          />

          {/* Dấu chỉ: chỉ màn hình rộng — hẹp hơn thì chữ đè lên nhau,
              bản cho điện thoại là danh sách ngay bên dưới */}
          <div className="pointer-events-none absolute inset-0 hidden lg:block">
            {a.marks.map((m, i) => (
              <Dau key={m.text} x={m.x} y={m.y} text={m.text} tre={0.2 + i * 0.12} />
            ))}
          </div>
        </div>
      </figure>

      <ul className="m-0 mt-7 grid list-none gap-2 p-0 lg:hidden">
        {a.marks.map((m) => (
          <li key={m.text} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-shu" />
            <span className="text-[13.5px] leading-relaxed text-paper/80">{m.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Motion giữ luôn phần dịch vị trí (x/y %) — đặt `transform` trong style
 * cùng lúc với hoạt ảnh thì Motion ghi đè mất, dấu văng ra ngoài khung. */
function Dau({ x, y, text, tre }: { x: number; y: number; text: string; tre: number }) {
  const trai = x > 55
  return (
    <motion.span
      data-motion
      className="absolute flex items-center gap-2"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        x: trai ? '-100%' : '0%',
        y: '-50%',
        flexDirection: trai ? 'row-reverse' : 'row',
      }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: T_BASE, delay: tre, ease: EASE_OUT }}
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-shu ring-2 ring-paper-3" />
      <span aria-hidden className="h-px w-7 bg-shu/70" />
      <span className="rounded-[2px] bg-paper-3 px-2.5 py-[5px] text-[11.5px] leading-none whitespace-nowrap text-sumi shadow-[0_4px_12px_-6px_rgba(24,32,26,0.45)] ring-1 ring-shu/45">
        {text}
      </span>
    </motion.span>
  )
}
