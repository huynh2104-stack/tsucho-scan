/**
 * Quyết định quanh «ước tính trước khi quét» — hàm thuần để test được; component chỉ việc vẽ.
 */

import type { ScanEstimate } from "./api.ts";

export type ScanHint =
  | { kind: "none" }                               // chưa có ước tính / không chọn gì
  | { kind: "allFree"; pages: number }             // mọi trang đã có sẵn → miễn phí
  | { kind: "mixed"; fresh: number; free: number } // một phần gọi AI
  | { kind: "allNew"; fresh: number };

export function scanHint(est: ScanEstimate | null): ScanHint {
  if (!est || est.pages <= 0) return { kind: "none" };
  if (est.new <= 0) {
    // Không còn trang nào để gọi AI mà cũng chẳng có trang nào đã đọc sẵn = toàn trang hỏng: đừng nói «miễn phí»
    if (est.free <= 0) return { kind: "none" };
    return { kind: "allFree", pages: est.free };
  }
  if (est.free > 0) return { kind: "mixed", fresh: est.new, free: est.free };
  return { kind: "allNew", fresh: est.new };
}

/** Chỉ hỏi lại khi CÓ trang gọi AI và (người dùng bật «hiện chi phí» HOẶC là tài khoản dùng thử):
 *  quét ảnh đã có sẵn không tốn gì nên không làm phiền. */
export function needsScanConfirm(est: ScanEstimate | null, showCost: boolean): boolean {
  if (!est || est.new <= 0) return false;
  return showCost || est.demo_left != null;
}

/** Tài khoản dùng thử không đủ lượt cho lần quét này. */
export function overDemoQuota(est: ScanEstimate | null): boolean {
  return !!est && est.demo_left != null && est.new > est.demo_left;
}

/** Số tiền ước tính hiển thị gọn: dưới 0.01 thì «< $0.01», còn lại 2 chữ số; null khi không biết giá. */
export function formatUsd(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < 0.01) return "< $0.01";
  return `$${v.toFixed(2)}`;
}
