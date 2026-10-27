'use client'

import { useEffect, useRef } from 'react'

/* 地紋 — hoa văn chống giả in mờ trên sổ ngân hàng và tờ tiền.
 *
 * Vẽ bằng toán, MỘT lần khi gắn, lên canvas (vẽ bằng SVG thì hơn tám nghìn
 * điểm nằm trong HTML). Mỗi vành là nhiều bản sao của một đường lượn
 * r = R + A·sin(n(t − φ)), lệch pha dần nhau nên đan thành lưới ren. */
export function Rosette({ size, color }: { size: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size * dpr
    cv.height = size * dpr
    ctx.scale(dpr, dpr)
    /* Màu lấy từ token --kei của trang (mực biểu mẫu), không viết cứng. */
    ctx.strokeStyle = color ?? (getComputedStyle(cv).getPropertyValue('--kei').trim() || '#9a7366')
    ctx.lineWidth = 0.6
    const c = size / 2
    const bands = [
      { R: 0.44, A: 0.014, n: 24, K: 72, a: 0.3 },
      { R: 0.335, A: 0.018, n: 18, K: 64, a: 0.34 },
      { R: 0.225, A: 0.016, n: 14, K: 56, a: 0.38 },
    ]
    for (const b of bands) {
      ctx.globalAlpha = b.a
      for (let k = 0; k < b.K; k++) {
        const ph = (k / b.K) * ((2 * Math.PI) / b.n)
        ctx.beginPath()
        for (let j = 0; j <= 540; j++) {
          const t = (j / 540) * 2 * Math.PI
          const r = size * (b.R + b.A * Math.sin(b.n * (t - ph)) + b.A * 0.45 * Math.sin(2 * b.n * (t + ph)))
          const x = c + r * Math.cos(t)
          const y = c + r * Math.sin(t)
          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
  }, [size, color])
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />
}
