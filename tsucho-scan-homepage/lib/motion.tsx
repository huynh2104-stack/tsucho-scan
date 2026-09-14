'use client'

import { motion, type MotionProps, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

/* ─────────────────────────────────────────────────────────────
   CHUYỂN ĐỘNG CỦA TRANG — phần chạy bằng Motion.

   Các con số ở đây là BẢN SAO của token trong `app/globals.css`
   (--ease-out, --t-base, --t-slow). Motion không đọc được biến CSS
   nên phải chép lại; đổi một bên thì đổi cả bên kia.

   Nhịp hiện dần: dịch 10px + mờ-tỏ, không phóng to thu nhỏ. Mỗi mục
   TỰ theo dõi khi nào nó lọt vào khung nhìn — không để cha điều
   khiển cả danh sách, vì trên điện thoại danh sách dài hơn màn hình
   và các mục cuối sẽ chạy xong khi chưa ai cuộn tới.

   An toàn khi JavaScript không chạy: `<noscript>` trong layout ép mọi
   thứ có `data-motion` hiện ra.
   ───────────────────────────────────────────────────────────── */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const T_BASE = 0.32
export const T_SLOW = 0.52
/** Khoảng cách giữa hai mục khi hiện lần lượt (40–60ms). */
export const NHIP = 0.05

/** Hiện khi 12% phần tử lọt vào, và chỉ một lần. */
export const TAM_NHIN = { once: true, amount: 0.12 } as const

export const len: Variants = {
  an: { opacity: 0, y: 10 },
  hien: (tre: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: T_SLOW, ease: EASE_OUT, delay: tre, delayChildren: tre },
  }),
}

/** Một khối hiện lên khi cuộn tới. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
  ...rest
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'li' | 'section' | 'p'
} & MotionProps) {
  const M = motion[as] as typeof motion.div
  return (
    <M
      data-motion
      className={className}
      initial="an"
      whileInView="hien"
      viewport={TAM_NHIN}
      custom={delay}
      variants={len}
      {...rest}
    >
      {children}
    </M>
  )
}

/** Một mục của danh sách. Tự theo dõi; `tre` là độ trễ tính bằng giây.
 *  Con bên trong khai báo biến thể `an`/`hien` sẽ chạy theo mục này. */
export function Item({
  children,
  className,
  tre = 0,
  as = 'li',
  ...rest
}: {
  children: ReactNode
  className?: string
  tre?: number
  as?: 'li' | 'div'
} & MotionProps) {
  const M = motion[as] as typeof motion.li
  return (
    <M
      data-motion
      className={className}
      initial="an"
      whileInView="hien"
      viewport={TAM_NHIN}
      custom={tre}
      variants={len}
      {...rest}
    >
      {children}
    </M>
  )
}
