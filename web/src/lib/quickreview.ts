/**
 * Chế độ «Soát nhanh» (task 3.2): đi lần lượt qua MỌI dòng cần soát của mọi mặt sổ, mỗi lần một dòng.
 * Logic thuần, có test (`quickreview.test.ts`); giao diện nằm ở `components/QuickReview.tsx`.
 *
 * «Cần soát» lấy đúng từ `analyzeRows` (cùng định nghĩa với bảng, huy hiệu cột trái và file Excel) — chế độ này
 * không có luật riêng nào. Dòng được nhận diện bằng `rid` (bền qua chèn/xoá dòng), không bằng chỉ số.
 */

import type { ResultStore, RowBands, Tx } from "./api.ts";
import { analyzeRows, type Chain, type FocusField } from "./review.ts";

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
  /** Kết quả cột 検算 của dòng (NG = chuỗi số dư lệch ở dòng này, kể cả khi người đã ✓). */
  chk: Chain;
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
        out.push({ key: rowKey(tx, ref), ref, need: infos[ri].need, field: infos[ri].field, chk: infos[ri].chk });
      });
    });
  }
  return out;
}

export const pendingOf = (rows: QRow[]): QRow[] => rows.filter((r) => r.need);

/** Số dòng mà chuỗi số dư VẪN lệch (NG) — kể cả những dòng người đã ✓. Thẻ «xong» chỉ được nói «chuỗi số dư khớp» khi bằng 0. */
export const chainBreaks = (rows: QRow[]): number => rows.filter((r) => r.chk === "NG").length;

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
  // Chưa có dòng hiện tại (mới vào, hoặc vừa xong hết rồi Ctrl+Z) thì bắt đầu từ ĐẦU danh sách
  const start = cur == null ? 0 : idx >= 0 ? idx + 1 : Math.min(Math.max(lastIdx, 0), rows.length);
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

/** Thứ tự (từ 0) của dòng trong TOÀN mặt sổ (qua mọi khối) — chỉ số dải ảnh của dòng đó trong `RowBands.bands`. */
export function sheetRowIndex(store: ResultStore, ref: RowRef): number {
  const data = store[ref.sheet];
  if (!data || ref.block >= data.blocks.length) return -1;
  let n = 0;
  for (let b = 0; b < ref.block; b++) n += data.blocks[b].rows.length;
  return n + ref.row;
}

/**
 * Phần ảnh cần cắt để xem MỘT dòng: dải của dòng đó nới thêm một dòng mỗi phía (lấy dải hàng xóm nếu có, không
 * thì bằng đúng chiều cao dòng), theo bề ngang TỜ GIẤY. Toạ độ 0..1 của ảnh hiện tại. Null nếu dải không dùng được.
 */
export type StripRect = {
  cx0: number; cx1: number; cy0: number; cy1: number;      // vùng cắt
  y0: number; y1: number;                                  // dải của chính dòng (nằm trong vùng cắt)
  exact: boolean;                                          // true = dải khớp theo nội dung; false = ước lượng
  skew: number;                                            // độ nghiêng trang (độ)
};

export function stripRect(bands: RowBands | null, index: number): StripRect | null {
  const band = bands?.bands[index];
  if (!bands || !band || !(band.y1 > band.y0)) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const h = band.y1 - band.y0;
  const prev = bands.bands[index - 1];
  const next = bands.bands[index + 1];
  const cy0 = clamp(prev && prev.y1 > prev.y0 ? prev.y0 : band.y0 - h);
  const cy1 = clamp(next && next.y1 > next.y0 ? next.y1 : band.y1 + h);
  const cx0 = clamp(bands.x0 ?? 0);
  const cx1 = clamp(bands.x1 ?? 1);
  if (!(cx1 > cx0) || !(cy1 > cy0)) return null;
  return { cx0, cx1, cy0, cy1, y0: clamp(band.y0), y1: clamp(band.y1), exact: band.method === "content", skew: bands.skew_deg || 0 };
}

/**
 * Chia dải ảnh thành 1–3 ĐOẠN xếp chồng theo chiều dọc (đọc từ trên xuống = từ trái sang phải).
 *
 * Vì sao: tờ sổ rộng hơn nhiều so với cột kết quả. Cho cả bề ngang vào một dải thì chữ nhỏ hơn cả ảnh ở khung giữa
 * — «phóng to» thành «thu nhỏ». Muốn dòng cao ≈ `STRIP_ROW_PX` điểm ảnh trên màn hình thì phải phóng; phần bề ngang
 * không vừa một cột (`STRIP_COL_PX`) thì cắt thành các đoạn, mỗi đoạn lấn sang đoạn kế một chút (5%) để một cột chữ
 * nằm sát chỗ cắt vẫn đọc trọn ở ít nhất một đoạn.
 */
export const STRIP_ROW_PX = 30;
export const STRIP_COL_PX = 600;
export const STRIP_MAX_SEGMENTS = 3;
export const STRIP_OVERLAP = 0.05;

export function stripSegments(rect: StripRect, imgW: number, imgH: number): { x0: number; x1: number }[] {
  const w = rect.cx1 - rect.cx0;
  const rowPx = (rect.y1 - rect.y0) * imgH;
  const zoom = rowPx > 0 ? STRIP_ROW_PX / rowPx : 1;
  const n = Math.min(STRIP_MAX_SEGMENTS, Math.max(1, Math.ceil((w * imgW * zoom) / STRIP_COL_PX)));
  const base = w / n;
  const ov = n > 1 ? w * STRIP_OVERLAP : 0;
  return Array.from({ length: n }, (_, i) => ({
    x0: Math.max(rect.cx0, rect.cx0 + i * base - (i > 0 ? ov : 0)),
    x1: Math.min(rect.cx1, rect.cx0 + (i + 1) * base + (i < n - 1 ? ov : 0)),
  }));
}

/** Phép tính của một dòng: số dư trước − rút + gửi = số dư kỳ vọng, so với số dư in. Null nếu chưa có mốc / dòng ghi chú. */
export type Calc = { before: number; out: number; inn: number; expected: number; printed: number | null; diff: number | null };

export function calcOf(tx: Tx, before: number | null): Calc | null {
  if (tx.is_note || before == null) return null;
  const out = tx.amount_out ?? 0;
  const inn = tx.amount_in ?? 0;
  const expected = before - out + inn;
  const printed = tx.balance ?? null;
  return { before, out, inn, expected, printed, diff: printed == null ? null : printed - expected };
}
