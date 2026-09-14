'use client'

import { motion, useInView, useReducedMotion, type Transition } from 'motion/react'
import { useId, useRef } from 'react'
import { EASE_OUT } from '@/lib/motion'

/* ─────────────────────────────────────────────────────────────
   BỐN CÔNG CỤ CHỈNH ẢNH — mỗi thẻ một cảnh nhỏ tự diễn.

   Hình tĩnh cũ quá sơ: chủ sản phẩm nói người xem "chưa hình dung được".
   Mỗi cảnh ở đây diễn ĐÚNG thao tác của công cụ, chậm và nhẹ:

     台形補正   tứ giác lệch → kéo bốn góc về khung chữ nhật (khung đích
                nét đứt luôn hiện, nên thấy rõ "kéo tới đâu")
     切り抜き   khung cắt thu vào ~8%, bốn tay cầm hiện ra, phần ngoài tối đi
     回転       tờ giấy nghiêng 12° xoay về 0° — không quay tròn
     明るさ     con trượt nhích sang phải, lớp trắng 0 → 18% → 8%

   Nhịp một vòng 8 giây, BẮT ĐẦU TỪ CHÍNH KHUNG ĐANG ĐỨNG YÊN (kết quả):
   mờ xuống 30% → lùi về trạng thái đầu → rõ lại → động tác chính ~1,4 giây
   (ease-out) → đứng yên ở kết quả ~5 giây. Vì khung đầu vòng trùng khung
   nghỉ nên lúc bắt đầu chạy không có cú nhảy. (Bản thử đầu bắt đầu vòng
   bằng khung trong suốt: thẻ 回転 biến mất 2,6 giây khi vừa cuộn tới.)

   Chỉ chạy khi thẻ nằm ≥60% trong khung nhìn; ra ngoài thì dừng ở khung
   cuối. Bốn thẻ lệch pha nhau (`pha`) để không cùng lúc nhúc nhích.
   Giảm chuyển động: hiện khung cuối, không chạy.
   ───────────────────────────────────────────────────────────── */

const CHU_KY = 8
/* nghỉ · mờ xuống 30% · lùi về đầu (mờ, chầm chậm) · rõ lại · động tác xong ·
   giữ tới hết vòng. Không bao giờ tắt hẳn — tắt hẳn là nháy. */
const T = [0, 0.06, 0.14, 0.18, 0.36, 1]

function useChay(pha: number) {
  const ref = useRef<SVGSVGElement>(null)
  const trong = useInView(ref, { amount: 0.6 })
  const it = useReducedMotion()
  const chay = trong && !it
  const vong = (delay = 0): Transition => ({
    duration: CHU_KY,
    times: T,
    ease: EASE_OUT,
    repeat: Infinity,
    delay: pha + delay,
  })
  const dung: Transition = { duration: 0.6, ease: EASE_OUT }
  return { ref, chay, vong, dung }
}

function Khung({
  children,
  label,
  svgRef,
}: {
  children: React.ReactNode
  label: string
  svgRef: React.Ref<SVGSVGElement>
}) {
  return (
    <svg ref={svgRef} viewBox="0 0 160 110" role="img" aria-label={label} className="h-auto w-full">
      <rect x="0" y="0" width="160" height="110" rx="4" fill="var(--paper-2)" />
      {children}
    </svg>
  )
}

/** Mấy dòng kẻ của trang sổ, vẽ trong một hình chữ nhật */
function DongKe({ x, y, w, h, n = 5, op = 1 }: { x: number; y: number; w: number; h: number; n?: number; op?: number }) {
  const buoc = h / (n + 1)
  return (
    <g opacity={op}>
      {Array.from({ length: n }, (_, k) => (
        <line
          key={k}
          x1={x + 8}
          x2={x + w - (k === n - 1 ? w * 0.4 : 8)}
          y1={y + buoc * (k + 1)}
          y2={y + buoc * (k + 1)}
          stroke="var(--sumi-2)"
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

/* ── 台形補正 ───────────────────────────────────────────────── */
export function MotionKeystone({ pha = 0, label }: { pha?: number; label: string }) {
  const { ref, chay, vong, dung } = useChay(pha)
  const LECH = 'M44 24 L120 13 L137 93 L22 86 Z'
  const VUONG = 'M30 16 L130 16 L130 92 L30 92 Z'
  const goc = [
    [44, 24, 30, 16],
    [120, 13, 130, 16],
    [137, 93, 130, 92],
    [22, 86, 30, 92],
  ]
  return (
    <Khung svgRef={ref} label={label}>
      {/* khung đích — luôn đứng yên */}
      <rect x="30" y="16" width="100" height="76" fill="none" stroke="var(--sumi-2)" strokeOpacity="0.45" strokeDasharray="3 3" />
      <motion.g
        initial={{ opacity: 1 }}
        animate={chay ? { opacity: [1, 0.3, 0.3, 1, 1, 1], transition: vong() } : { opacity: 1, transition: dung }}
      >
        <motion.path
          fill="var(--paper-3)"
          stroke="var(--sumi-2)"
          strokeWidth="1.2"
          initial={{ d: VUONG }}
          animate={chay ? { d: [VUONG, VUONG, LECH, LECH, VUONG, VUONG], transition: vong() } : { d: VUONG, transition: dung }}
        />
        <motion.g
          initial={{ opacity: 1 }}
          animate={chay ? { opacity: [1, 1, 0.3, 0.3, 1, 1], transition: vong() } : { opacity: 1, transition: dung }}
        >
          <DongKe x={30} y={16} w={100} h={76} />
        </motion.g>
        {goc.map(([x0, y0, x1, y1], k) => (
          <motion.circle
            key={k}
            r="3.8"
            fill="var(--shu)"
            stroke="var(--paper-3)"
            strokeWidth="1.5"
            initial={{ cx: x1, cy: y1 }}
            animate={
              chay
                ? { cx: [x1, x1, x0, x0, x1, x1], cy: [y1, y1, y0, y0, y1, y1], transition: vong() }
                : { cx: x1, cy: y1, transition: dung }
            }
          />
        ))}
      </motion.g>
    </Khung>
  )
}

/* ── 切り抜き ───────────────────────────────────────────────── */
export function MotionCrop({ pha = 0, label }: { pha?: number; label: string }) {
  const { ref, chay, vong, dung } = useChay(pha)
  const DAU = { x: 18, y: 10, width: 124, height: 90 }
  const CUOI = { x: 28, y: 22, width: 104, height: 70 } // thu vào ~8%, cắt bỏ phần tiêu đề
  const keo = (k: 'x' | 'y' | 'width' | 'height') => [CUOI[k], CUOI[k], DAU[k], DAU[k], CUOI[k], CUOI[k]]
  const goc = (cx: number, cy: number) => [
    [DAU.x, DAU.y, CUOI.x, CUOI.y],
    [DAU.x + DAU.width, DAU.y, CUOI.x + CUOI.width, CUOI.y],
    [DAU.x + DAU.width, DAU.y + DAU.height, CUOI.x + CUOI.width, CUOI.y + CUOI.height],
    [DAU.x, DAU.y + DAU.height, CUOI.x, CUOI.y + CUOI.height],
  ][cx * 2 + cy]
  const idMask = `cat-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <Khung svgRef={ref} label={label}>
      {/* trang giấy + dải tiêu đề phía trên — đứng yên */}
      <rect x="18" y="10" width="124" height="90" fill="var(--paper-3)" stroke="var(--rule)" />
      <rect x="18" y="10" width="124" height="11" fill="var(--beni-soft)" />
      <DongKe x={18} y={20} w={124} h={80} n={6} />
      <defs>
        <mask id={idMask}>
          <rect x="0" y="0" width="160" height="110" fill="white" />
          <motion.rect
            fill="black"
            initial={CUOI}
            animate={
              chay
                ? { x: keo('x'), y: keo('y'), width: keo('width'), height: keo('height'), transition: vong() }
                : { ...CUOI, transition: dung }
            }
          />
        </mask>
      </defs>
      <motion.g
        initial={{ opacity: 1 }}
        animate={chay ? { opacity: [1, 0.3, 0.3, 1, 1, 1], transition: vong() } : { opacity: 1, transition: dung }}
      >
        <rect x="0" y="0" width="160" height="110" fill="var(--sumi)" fillOpacity="0.22" mask={`url(#${idMask})`} />
        <motion.rect
          fill="none"
          stroke="var(--shu)"
          strokeWidth="1.4"
          initial={CUOI}
          animate={
            chay
              ? { x: keo('x'), y: keo('y'), width: keo('width'), height: keo('height'), transition: vong() }
              : { ...CUOI, transition: dung }
          }
        />
        {[0, 1, 2, 3].map((k) => {
          const [x0, y0, x1, y1] = goc(k >> 1, k & 1)
          return (
            <motion.circle
              key={k}
              r="2.6"
              fill="var(--shu)"
              initial={{ cx: x1, cy: y1, opacity: 1 }}
              animate={
                chay
                  ? {
                      cx: [x1, x1, x0, x0, x1, x1],
                      cy: [y1, y1, y0, y0, y1, y1],
                      opacity: [1, 0, 0, 0, 1, 1],
                      transition: vong(),
                    }
                  : { cx: x1, cy: y1, opacity: 1, transition: dung }
              }
            />
          )
        })}
      </motion.g>
    </Khung>
  )
}

/* ── 回転 ───────────────────────────────────────────────────── */
export function MotionRotate({ pha = 0, label }: { pha?: number; label: string }) {
  const { ref, chay, vong, dung } = useChay(pha)
  return (
    <Khung svgRef={ref} label={label}>
      {/* đường thẳng đích — đứng yên */}
      <rect x="38" y="17" width="84" height="76" fill="none" stroke="var(--sumi-2)" strokeOpacity="0.45" strokeDasharray="3 3" />
      <motion.g
        style={{ transformOrigin: '80px 55px' }}
        initial={{ rotate: 0, opacity: 1 }}
        animate={
          chay
            ? { rotate: [0, 0, 12, 12, 0, 0], opacity: [1, 0.3, 0.3, 1, 1, 1], transition: vong() }
            : { rotate: 0, opacity: 1, transition: dung }
        }
      >
        <rect x="38" y="17" width="84" height="76" rx="1.5" fill="var(--paper-3)" stroke="var(--sumi-2)" strokeWidth="1.2" />
        <DongKe x={38} y={17} w={84} h={76} />
      </motion.g>
      <motion.path
        d="M134 38 A 30 30 0 0 1 134 72"
        fill="none"
        stroke="var(--shu)"
        strokeWidth="1.4"
        strokeLinecap="round"
        initial={{ pathLength: 1, opacity: 0.8 }}
        animate={
          chay
            ? { pathLength: [1, 1, 0, 0, 1, 1], opacity: [0.8, 0, 0, 0.9, 0.9, 0.8], transition: vong() }
            : { pathLength: 1, opacity: 0.8, transition: dung }
        }
      />
      <text x="146" y="58" textAnchor="middle" fontSize="8" fill="var(--sumi-2)" fontFamily="var(--font-mono)">
        0°
      </text>
    </Khung>
  )
}

/* ── 明るさ・コントラスト ───────────────────────────────────── */
export function MotionLevels({ pha = 0, label }: { pha?: number; label: string }) {
  const { ref, chay, vong, dung } = useChay(pha)
  return (
    <Khung svgRef={ref} label={label}>
      {/* ảnh chụp tối — trang giấy phủ một lớp mực mỏng */}
      <rect x="22" y="8" width="116" height="78" fill="var(--paper-3)" stroke="var(--rule)" />
      <DongKe x={22} y={8} w={116} h={78} />
      <rect x="22" y="8" width="116" height="78" fill="var(--sumi)" fillOpacity="0.2" />
      <motion.rect
        x="22"
        y="8"
        width="116"
        height="78"
        fill="white"
        initial={{ opacity: 0.08 }}
        animate={
          chay
            ? {
                opacity: [0.08, 0.08, 0, 0, 0.18, 0.08, 0.08],
                transition: { ...vong(), times: [0, 0.06, 0.14, 0.18, 0.28, 0.38, 1] },
              }
            : { opacity: 0.08, transition: dung }
        }
      />
      {/* con trượt độ sáng */}
      <line x1="34" x2="126" y1="99" y2="99" stroke="var(--rule)" strokeWidth="2.4" strokeLinecap="round" />
      <motion.circle
        cy="99"
        r="4.5"
        fill="var(--paper-3)"
        stroke="var(--shu)"
        strokeWidth="1.6"
        initial={{ cx: 98, opacity: 1 }}
        animate={
          chay
            ? {
                cx: [98, 98, 56, 56, 112, 98, 98],
                opacity: [1, 0.3, 0.3, 1, 1, 1, 1],
                transition: { ...vong(), times: [0, 0.06, 0.14, 0.18, 0.28, 0.38, 1] },
              }
            : { cx: 98, opacity: 1, transition: dung }
        }
      />
    </Khung>
  )
}

export const MOTION_TOOLS = [MotionKeystone, MotionCrop, MotionRotate, MotionLevels]
