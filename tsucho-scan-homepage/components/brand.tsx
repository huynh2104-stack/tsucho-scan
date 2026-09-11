'use client'

/* BIỂU TƯỢNG THƯƠNG HIỆU — con dấu đỏ có một dòng được tô.
 *
 * Vì sao chọn hình này: đối thủ (SmartOCR, AISpect, Shuttle Smile) đều dùng
 * logo chữ + màu xanh công nghệ, nhìn na ná nhau. Con dấu 朱 đỏ thì vừa rất
 * Nhật, vừa nói đúng thứ sản phẩm này khác người: nó KIỂM và CHỈ ĐÚNG CHỖ.
 *
 * Hình học thuần, không có chữ — nên nét ở 16px (favicon) lẫn ở cỡ lớn, và
 * không phụ thuộc phông chữ nào.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className="shrink-0"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="5" fill="var(--shu)" />
      <g fill="var(--paper-3)">
        <rect x="7" y="8" width="18" height="2" rx="1" opacity="0.45" />
        <rect x="7" y="14" width="18" height="4" rx="1.4" />
        <rect x="7" y="22" width="18" height="2" rx="1" opacity="0.45" />
      </g>
    </svg>
  )
}

/** Dấu + tên, dùng ở thanh trên và chân trang. */
export function Brand({
  size = 26,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={size} />
      <span className="font-display font-semibold tracking-tight whitespace-nowrap">
        通帳スキャン
      </span>
    </span>
  )
}
