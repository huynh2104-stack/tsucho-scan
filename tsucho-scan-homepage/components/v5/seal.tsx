'use client'

import { useId } from 'react'

/* Dấu 日付印 kiểu ngân hàng/kế toán: chữ trên, dải ngày ở giữa, chữ dưới.
 * Mực không đều (bộ lọc nhiễu) để trông như ấn bằng tay chứ không phải
 * một hình tròn vẽ máy. Ngày lấy đúng ngày dòng cuối của sổ mẫu. */
export function Seal({
  text,
  size = 110,
  date = '2025.04.10',
}: {
  text: string[]
  size?: number
  date?: string
}) {
  const id = 'ink' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className="hanko" width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <filter id={id} x="-6%" y="-6%" width="112%" height="112%">
          {/* Mực loang không đều: nhiễu tần số thấp làm mờ vài mảng, không xê dịch nét */}
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.9" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="none" stroke="currentColor">
        <circle cx="60" cy="60" r="55" strokeWidth="4.2" />
        <circle cx="60" cy="60" r="48.5" strokeWidth="1.2" />
        <path d="M14 47h92M14 73h92" strokeWidth="1.6" />
        <text x="60" y="41" textAnchor="middle" className="seal-t" fill="currentColor" stroke="none">
          {text[0]}
        </text>
        <text x="60" y="64.5" textAnchor="middle" className="seal-d" fill="currentColor" stroke="none">
          {date}
        </text>
        <text x="60" y="99" textAnchor="middle" className="seal-t" fill="currentColor" stroke="none">
          {text[1]}
        </text>
      </g>
    </svg>
  )
}
