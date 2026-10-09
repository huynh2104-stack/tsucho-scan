/**
 * Chế độ «Soát nhanh» (task 3.2): đi lần lượt qua MỌI dòng cần soát của mọi mặt sổ, mỗi lần một dòng.
 * Logic thuần, có test (`quickreview.test.ts`); giao diện nằm ở `components/QuickReview.tsx`.
 *
 * «Cần soát» lấy đúng từ `analyzeRows` (cùng định nghĩa với bảng, huy hiệu cột trái và file Excel) — chế độ này
 * không có luật riêng nào. Dòng được nhận diện bằng `rid` (bền qua chèn/xoá dòng), không bằng chỉ số.
 */

import type { ResultStore, Tx } from "./api.ts";
import { analyzeRows, type FocusField } from "./review.ts";

/** Địa chỉ một dòng trong kho (cùng dạng với `TxRef` của ReviewPane). */
export type RowRef = { sheet: string; block: number; row: number };

export type QRow = {
  /** Danh tính bền của dòng: `rid`; dữ liệu cũ chưa có rid thì dùng vị trí. */
  key: string;
  ref: RowRef;
  /** Dòng đang «cần soát» theo định nghĩa chung. */
  need: boolean;
  /** Ô gây lệch (để đặt con trỏ khi thoát về bảng). */
  field: FocusField;
};

export const rowKey = (tx: Tx, ref: RowRef): string => tx.rid ?? `${ref.sheet}:${ref.block}:${ref.row}`;

/** Mọi dòng thật của các mặt sổ đã quét, theo thứ tự cột trái → khối → dòng. Mặt không có trong `order` bị bỏ. */
export function flattenRows(order: string[], store: ResultStore): QRow[] {
  const out: QRow[] = [];
  for (const sid of order) {
    const data = store[sid];
    if (!data) continue;
    data.blocks.forEach((block, bi) => {
      const infos = analyzeRows(block.rows);
      block.rows.forEach((tx, ri) => {
        const ref = { sheet: sid, block: bi, row: ri };
        out.push({ key: rowKey(tx, ref), ref, need: infos[ri].need, field: infos[ri].field });
      });
    });
  }
  return out;
}

export const pendingOf = (rows: QRow[]): QRow[] => rows.filter((r) => r.need);

/**
 * Dòng đang xem sau mỗi lần dữ liệu đổi.
 * - Dòng hiện tại vẫn cần soát → ở lại.
 * - Không còn cần (vừa ✓ hoặc vừa được sửa đúng) hoặc đã bị xoá → sang dòng cần soát KẾ TIẾP trong danh sách;
 *   hết phía sau thì quay về dòng cần soát đầu tiên; không còn dòng nào → null (xong).
 * `lastIdx` = vị trí của dòng đó lần trước, dùng khi nó đã bị xoá khỏi danh sách (dòng sau nó nay chiếm vị trí cũ).
 */
export function resolveCurrent(rows: QRow[], cur: string | null, lastIdx: number): { row: QRow | null; idx: number } {
  const idx = cur == null ? -1 : rows.findIndex((r) => r.key === cur);
  if (idx >= 0 && rows[idx].need) return { row: rows[idx], idx };
  const start = idx >= 0 ? idx + 1 : Math.min(Math.max(lastIdx, 0), rows.length);
  for (let i = start; i < rows.length; i++) if (rows[i].need) return { row: rows[i], idx: i };
  for (let i = 0; i < start && i < rows.length; i++) if (rows[i].need) return { row: rows[i], idx: i };
  return { row: null, idx: -1 };
}

/** Dòng cần soát đứng liền sau (`dir` = 1) hoặc liền trước (-1) dòng ở vị trí `idx`, quay vòng. Null nếu không có dòng nào khác. */
export function stepFrom(rows: QRow[], idx: number, dir: 1 | -1): QRow | null {
  const n = rows.length;
  for (let k = 1; k < n; k++) {
    const r = rows[(((idx + dir * k) % n) + n) % n];
    if (r.need) return r;
  }
  return null;
}

/**
 * Tiến độ «Dòng k/N»: `seen` = mọi dòng đã từng nằm trong danh sách cần soát trong phiên này.
 * N = số dòng đã thấy; k = số dòng đã xử lý xong + thứ tự của dòng hiện tại trong phần còn lại.
 */
export function progress(seen: ReadonlySet<string>, pending: QRow[], curKey: string | null): { k: number; n: number } {
  const pendingKeys = new Set(pending.map((r) => r.key));
  const done = [...seen].filter((key) => !pendingKeys.has(key)).length;
  const pos = curKey == null ? 0 : Math.max(0, pending.findIndex((r) => r.key === curKey));
  return { k: Math.min(done + pos + 1, done + pending.length), n: done + pending.length };
}
