/**
 * Cài đặt người dùng (task 3.1): kiểu + giá trị mặc định + hàm thuần. Tách khỏi `prefs.tsx` (có React) để
 * `npm test` chạy được bằng node. Bản sao phía máy chủ: `api/prefs.py` (DEFAULTS) — hai bên được kiểm cùng
 * một file `tests/fixtures/prefs_defaults.json`.
 */

export type Prefs = {
  /** Cỡ chữ (3.4). */
  fontScale: 1 | 1.15 | 1.3;
  /** Từ điển sửa lỗi (3.3): chỉ gợi ý / tự áp / tắt. */
  dictMode: "suggest" | "auto" | "off";
  /** Hiện chi phí ước tính trước khi quét (4.3). */
  showCost: boolean;
  /** Tự xoay trang chưa quét khi máy chắc chắn về hướng (5.3). */
  autoRotate: boolean;
  /** Tự căn chỉnh ảnh mới tải lên, chỉ các bước «chắc chắn» (5.4). */
  autoFixOnUpload: boolean;
  /** Chế độ kế toán 仕訳 (6.x). */
  accountingMode: boolean;
  /** Ngôn ngữ / chủ đề người dùng đã chọn; null = chưa chọn (để trình duyệt tự đoán). */
  lang: "vi" | "en" | "ja" | null;
  theme: "light" | "dark" | "system" | null;
};

export const DEFAULT_PREFS: Prefs = {
  fontScale: 1,
  dictMode: "suggest",
  showCost: false,
  autoRotate: false,
  autoFixOnUpload: false,
  accountingMode: false,
  lang: null,
  theme: null,
};

/** Gộp một phần thay đổi vào cài đặt hiện có (không sửa đối tượng cũ). */
export function mergePrefs(base: Prefs, patch: Partial<Prefs>): Prefs {
  return { ...base, ...patch };
}
