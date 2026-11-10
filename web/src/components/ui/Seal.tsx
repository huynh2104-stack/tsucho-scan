/**
 * Con dấu 検印 — dấu người soát đóng lên dòng đã xác nhận. Đây là động tác đặc trưng của app: máy kiểm
 * chuỗi số dư, con người khép mắt xích bằng một con dấu. Mực 朱, hơi nghiêng như dấu đóng tay thật.
 *
 * `press` chạy hiệu ứng ấn dấu MỘT lần — chỉ bật ở đúng dòng vừa được xác nhận, đừng bật cho cả bảng.
 */
export default function Seal({
  size = 22,
  glyph = "検",
  press = false,
  className = "",
}: {
  size?: number;
  glyph?: string;
  press?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex flex-none items-center justify-center ${press ? "seal-press" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        transform: press ? undefined : "rotate(var(--seal-tilt, -9deg))",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--shu)" strokeWidth="2.2" />
        <text
          x="16"
          y="16.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="19"
          fill="var(--shu)"
          style={{ fontFamily: "var(--font-seal), var(--font-ui), serif" }}
        >
          {glyph}
        </text>
      </svg>
    </span>
  );
}
