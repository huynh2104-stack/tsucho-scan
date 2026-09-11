'use client'

import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'

/* Motion KHÔNG tự tắt hoạt ảnh cho người đặt máy "giảm chuyển động" —
 * phải nói ra. `reducedMotion="user"` khiến mọi chuyển vị và co giãn
 * đứng yên, chỉ còn mờ-tỏ, trên toàn trang.
 *
 * Nhưng KHÔNG ĐƯỢC bật ngay từ lần dựng đầu. Máy chủ không biết máy người
 * dùng đặt gì, nên nó dựng ra kiểu đầy đủ (`opacity` + `transform`); còn
 * trình duyệt đang bật "giảm chuyển động" thì dựng ra kiểu rút gọn (chỉ
 * `opacity`). Hai bên khác nhau → React báo lỗi hydration và dựng lại cả
 * nhánh. Lỗi này đã đo được thật, không phải phòng xa.
 *
 * Cách chữa: lần dựng đầu ở trình duyệt phải GIỐNG HỆT máy chủ, xong rồi
 * mới đổi sang "user". Lúc đổi thì chưa có hoạt ảnh nào chạy (phải cuộn
 * tới mới chạy), nên không ai thấy gì nhấp nháy.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  const [daGan, setDaGan] = useState(false)
  useEffect(() => setDaGan(true), [])

  return <MotionConfig reducedMotion={daGan ? 'user' : 'never'}>{children}</MotionConfig>
}
