'use client'

import { motion, type MotionProps, type Transition, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

/* ─────────────────────────────────────────────────────────────
   CHUYỂN ĐỘNG CỦA TRANG

   Bản trước tự viết bằng IntersectionObserver và có một lỗi kín:
   sau 2,5 giây, cái "lưới an toàn" gỡ lớp ẩn khỏi MỌI phần tử, kể cả
   những phần chưa cuộn tới. Nên chỉ màn đầu có hiệu ứng, còn từ
   「数字が合っているかは…」trở xuống thì không — đúng như đã thấy.

   Nay dùng Motion: `whileInView` theo dõi từng phần tử riêng, không có
   đồng hồ chung nào cả, nên phần ở cuối trang hiện đúng lúc cuộn tới
   dù là mười phút sau.

   An toàn khi JavaScript không chạy: `<noscript>` trong layout ép mọi
   thứ hiện. Không có nó thì trang trắng.
   ───────────────────────────────────────────────────────────── */

/** Nhịp chung — cùng đường cong với hoạt ảnh CSS đã có trên trang. */
const DIU: Transition = { duration: 0.62, ease: [0.22, 1, 0.36, 1] }

/** Ngưỡng chung: hiện khi 12% phần tử lọt vào, và chỉ một lần. */
export const TAM_NHIN = { once: true, amount: 0.12 } as const

export const len: Variants = {
  an: { opacity: 0, y: 18 },
  hien: { opacity: 1, y: 0, transition: DIU },
}

/** Cha chia nhịp cho con — dùng cho danh sách. */
export function damNhip(buoc = 0.07, tre = 0): Variants {
  return {
    an: {},
    hien: { transition: { staggerChildren: buoc, delayChildren: tre } },
  }
}

/** Một khối hiện lên khi cuộn tới. Thay cho `data-reveal` cũ. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  as = 'div',
  ...rest
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  as?: 'div' | 'li' | 'section' | 'p'
} & MotionProps) {
  const M = motion[as] as typeof motion.div
  return (
    <M
      data-motion
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={TAM_NHIN}
      transition={{ ...DIU, delay }}
      {...rest}
    >
      {children}
    </M>
  )
}

/** Con của một danh sách có `damNhip` ở cha. */
export function Item({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & MotionProps) {
  return (
    <motion.li data-motion variants={len} className={className} {...rest}>
      {children}
    </motion.li>
  )
}

/** Danh sách chia nhịp: cha điều khiển, con chỉ khai báo `variants={len}`. */
export function List({
  children,
  className,
  buoc = 0.07,
  as = 'ul',
  ...rest
}: {
  children: ReactNode
  className?: string
  buoc?: number
  as?: 'ul' | 'ol' | 'div'
} & MotionProps) {
  const M = motion[as] as typeof motion.ul
  return (
    <M
      className={className}
      initial="an"
      whileInView="hien"
      viewport={TAM_NHIN}
      variants={damNhip(buoc)}
      {...rest}
    >
      {children}
    </M>
  )
}
