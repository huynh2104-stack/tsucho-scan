'use client'

import Image from 'next/image'
import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { useI18n } from '@/lib/i18n'

/* MÀN HÌNH LÀM VIỆC — ẢNH THẬT.
 *
 * Hai bản trước đều vẽ lại giao diện bằng HTML. Người dùng nói thẳng:
 * "màn hình quá dài, quá giả tạo". Đúng cả hai ý:
 *
 *   · Tỉ lệ sai. Bản cũ là 768×286 ≈ 2,69:1 — không có máy tính xách tay
 *     nào màn hình dẹt như thế. Máy thật là 16:10. Mắt biết điều đó dù
 *     không đo, nên nhìn vào là thấy giả ngay.
 *   · Vẽ lại thì mãi mãi chỉ là bản vẽ lại. Ảnh chụp thật có những thứ
 *     không ai vẽ ra được: đúng 24 dòng, đúng cột 検算, hàng tổng ở đáy,
 *     dòng chữ nhỏ cảnh báo dưới cùng.
 *
 * Nay là ẢNH CHỤP THẬT của ứng dụng đang chạy, giao diện tiếng Nhật, có
 * vệt đỏ trên ảnh sổ và đúng dòng đó được chọn ở bảng bên phải.
 *
 * Tên pháp nhân trong ảnh là TÊN MẪU, do script chụp thay vào trước khi
 * bấm chụp (xem tools/chup-anh-man-hinh.py). Dữ liệu phát triển là sổ của
 * khách hàng thật, mà trang này thì công khai.
 *
 * Ảnh 16:10, đúng tỉ lệ chụp, nên không méo và không phải cắt.
 */
export function Laptop() {
  const { t } = useI18n()
  const a = t.app
  const khung = useRef<HTMLDivElement>(null)

  /* Máy trôi chậm hơn trang một nhịp khi cuộn — chiều sâu thật, gắn vào
     vị trí cuộn nên kéo ngược lên là nó lùi lại theo. */
  const { scrollYProgress } = useScroll({
    target: khung,
    offset: ['start end', 'end start'],
  })
  const troi = useTransform(scrollYProgress, [0, 1], [26, -26])

  return (
    <div ref={khung} className="mx-auto w-full max-w-[52rem]">
      <motion.div style={{ y: troi }}>
        {/* ══ NẮP MÁY ══ */}
        <motion.div
          data-motion
          initial={{ opacity: 0, y: 26, rotateX: 7 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          style={{ perspective: 1200 }}
          className="rounded-t-[10px] bg-gradient-to-b from-[#3d473f] to-[#2a322c] p-[6px] pb-0 shadow-[0_46px_80px_-34px_rgba(0,0,0,0.8)] sm:rounded-t-[16px] sm:p-[10px] sm:pb-0"
        >
          <div className="flex justify-center pb-[3px]">
            <span className="h-[3px] w-[3px] rounded-full bg-[#5b665e]" />
          </div>

          <div className="relative aspect-[16/10] overflow-hidden rounded-[3px] bg-[#081019] sm:rounded-[6px]">
            <Image
              src="/shots/app-dark.webp"
              alt={a.shotAlt}
              width={2200}
              height={1375}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 830px"
              className="h-full w-full object-cover object-top"
              priority={false}
            />

            {/* Ánh phản trên mặt kính — rất nhạt, chỉ để ra chất kính */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent"
            />

            {/* Ba dấu chỉ vào đúng chỗ đáng nhìn. Chỉ hiện ở màn hình rộng —
                dưới đó chữ sẽ đè lên nhau; bản cho điện thoại nằm ngay dưới. */}
            <div className="pointer-events-none absolute inset-0 hidden lg:block">
              {a.marks.map((m, i) => (
                <Dau key={m.text} x={m.x} y={m.y} text={m.text} tre={0.55 + i * 0.22} />
              ))}
            </div>
          </div>
        </motion.div>

        {/* ══ ĐẾ MÁY ══ */}
        <div className="-mx-2 flex h-[9px] items-start justify-center rounded-b-[7px] bg-gradient-to-b from-[#3b453e] via-[#2f382f] to-[#222a24] sm:-mx-4 sm:h-[13px]">
          <span className="mt-[1px] h-[2px] w-[14%] rounded-b-[3px] bg-[#181e19]" />
        </div>
      </motion.div>

      {/* Bản cho màn hình hẹp: cùng ba điểm đó, viết thành dòng */}
      <ul className="m-0 mt-7 grid list-none gap-2 p-0 lg:hidden">
        {a.marks.map((m) => (
          <li key={m.text} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-shu" />
            <span className="text-[13px] leading-relaxed text-paper/70">{m.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Một dấu chỉ: chấm đỏ nhấp nháy một lần, rồi nhãn trượt ra.
 *
 * Chỗ này từng hỏng: đặt `transform: translate(-100%,-50%)` trong `style`
 * ĐỒNG THỜI cho Motion chạy `scale`. Motion tự dựng lại chuỗi transform
 * từ các giá trị nó quản, nên nó GHI ĐÈ luôn cái translate — dấu bên phải
 * văng ra ngoài khung màn hình, bị `overflow-hidden` cắt mất, và vì không
 * bao giờ lọt vào tầm nhìn nên nó nằm ẩn vĩnh viễn.
 *
 * Cách đúng: đưa translate cho chính Motion giữ qua `x` / `y` (Motion
 * nhận cả đơn vị phần trăm), để mọi thứ nằm trong một chuỗi transform. */
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
      initial={{ opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, delay: tre, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <motion.span
          className="absolute inset-0 rounded-full bg-shu"
          initial={{ scale: 1, opacity: 0.85 }}
          whileInView={{ scale: [1, 2.6, 1], opacity: [0.85, 0, 0.85] }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1.5, delay: tre + 0.15, times: [0, 0.6, 1] }}
        />
        <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-shu ring-2 ring-[#081019]" />
      </span>
      <span aria-hidden className="h-px w-7 bg-shu/55" />
      <span className="rounded-[2px] bg-[#0b141c] px-2.5 py-[5px] text-[11px] leading-none whitespace-nowrap text-paper-3 ring-1 ring-shu/45">
        {text}
      </span>
    </motion.span>
  )
}
