'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/* CHÚ THÍCH BẬT MỞ — một cách dùng cho cả chuột lẫn ngón tay.
 *
 * Máy tính: rê chuột (hoặc tab tới) là hiện.
 * Điện thoại: bấm vào dấu ? trong hình tròn mới hiện.
 *
 * Cùng MỘT nút, không tách hai thành phần: nút vừa nhận `hover` vừa nhận
 * `click`, nên không có màn hình nào bị bỏ rơi. Trên điện thoại `hover`
 * không bao giờ bắn nên chỉ còn `click` — đúng thứ ta muốn, không cần dò
 * xem đang là thiết bị gì (dò thiết bị luôn sai ở máy lai cảm ứng).
 *
 * Nội dung nằm trong `children` nên chỗ nào cũng nhét được: chữ, ảnh, hay
 * một hoạt ảnh nhỏ.
 */
export function Explain({
  label,
  children,
}: {
  /** Đọc cho người dùng trình đọc màn hình biết nút này giải thích cái gì */
  label: string
  children: React.ReactNode
}) {
  const [mo, setMo] = useState(false)
  const [lech, setLech] = useState(0)
  const [rong, setRong] = useState(304)
  const id = useId()
  const boc = useRef<HTMLSpanElement>(null)

  /* KẸP hộp chú thích trong màn hình.
   *
   * Hộp neo vào nút `?`, mà nút đó có thể nằm sát mép phải — trên điện
   * thoại đo được hộp lòi ra tới 604px trong khung 375px, kéo tràn ngang cả
   * trang. Không có cách thuần CSS nào chắc chắn vì vị trí nút phụ thuộc
   * chữ đã xuống dòng thế nào; nên đo một lần lúc mở rồi đặt độ lệch.
   *
   * Đo trong `useLayoutEffect` để đặt xong TRƯỚC khi trình duyệt vẽ — dùng
   * `useEffect` thì người dùng thấy hộp nhảy một cái. */
  useLayoutEffect(() => {
    if (!mo || !boc.current) return
    const r = boc.current.getBoundingClientRect()
    const w = Math.min(304, window.innerWidth - 24)
    const trai = Math.max(12, Math.min(r.left - 12, window.innerWidth - w - 12))
    setRong(w)
    setLech(trai - r.left)
  }, [mo])

  // Bấm ra ngoài hoặc bấm Esc thì đóng — nếu không, trên điện thoại nó
  // nằm lì và che mất nội dung phía dưới.
  useEffect(() => {
    if (!mo) return
    const ngoai = (e: PointerEvent) => {
      if (!boc.current?.contains(e.target as Node)) setMo(false)
    }
    const phim = (e: KeyboardEvent) => e.key === 'Escape' && setMo(false)
    document.addEventListener('pointerdown', ngoai)
    document.addEventListener('keydown', phim)
    return () => {
      document.removeEventListener('pointerdown', ngoai)
      document.removeEventListener('keydown', phim)
    }
  }, [mo])

  return (
    <span ref={boc} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={mo}
        aria-describedby={mo ? id : undefined}
        onClick={() => setMo((v) => !v)}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setMo(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setMo(false)}
        onFocus={() => setMo(true)}
        onBlur={() => setMo(false)}
        className="ml-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-sumi-3/50 text-[11px] leading-none font-semibold text-sumi-2 hover:border-shu hover:bg-shu hover:text-paper-3"
      >
        ?
      </button>

      {mo && (
        <span
          id={id}
          role="tooltip"
          style={{ left: `${lech}px`, width: `${rong}px` }}
          className="absolute bottom-full z-30 mb-2 rounded-sm border border-rule bg-paper-3 p-3 text-left shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]"
        >
          {children}
        </span>
      )}
    </span>
  )
}
