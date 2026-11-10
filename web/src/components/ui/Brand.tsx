/**
 * Dấu thương hiệu: con dấu 朱 có một dòng được tô — đúng thứ sản phẩm làm: chỉ ra một dòng trên trang giấy.
 * Cùng hình với trang giới thiệu (tsucho-scan-homepage/components/brand.tsx). Hình học thuần, nét ở mọi cỡ.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="flex-none">
      <rect x="1.5" y="1.5" width="29" height="29" rx="3" fill="#bd392c" />
      <g fill="#ffffff">
        <rect x="7" y="8" width="18" height="2" rx="1" opacity="0.5" />
        <rect x="7" y="14" width="18" height="4" rx="1.2" />
        <rect x="7" y="22" width="18" height="2" rx="1" opacity="0.5" />
      </g>
    </svg>
  );
}
