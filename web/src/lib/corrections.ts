/**
 * Từ điển sửa lỗi học từ chỉnh sửa (task 3.3) — phần THUẦN: khoá so khớp, gợi ý, tìm dòng giống, áp dụng. Có test
 * (`corrections.test.ts`). Máy chủ (`api/corrections.py`) chỉ LƯU; mọi so khớp chạy ở trình duyệt trên bản từ điển đã
 * tải một lần, nên vừa học xong là các dòng giống hệt trong cùng sổ sáng lên ngay, không chờ mạng.
 *
 * Nguyên tắc: máy chỉ ĐỀ XUẤT, người bấm mới áp dụng (trừ chế độ «tự áp» người dùng tự bật — và khi đó vẫn báo, không
 * bao giờ âm thầm). Chữ thay vào là ĐÚNG chữ người đã gõ; khoá chỉ để tìm.
 */

import type { DictEntry, EditField, ResultStore, Tx } from "./api.ts";
import { applyDictEdit, shown } from "./review.ts";

export type DictField = DictEntry["field"];
export const DICT_FIELDS: readonly DictField[] = ["description", "kind"];
export const isDictField = (f: EditField): f is DictField => (DICT_FIELDS as readonly string[]).includes(f);

/** Khoảng trắng bị bỏ khi so khớp — liệt kê TƯỜNG MINH theo mã ký tự, đúng bản sao `_WS_CODES` của `api/corrections.py`
 *  (xem lý do ở đó). Viết bằng mã số chứ không gõ thẳng ký tự: nhiều ký tự trong nhóm này vô hình trong trình soạn thảo. */
const WS_CODES = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, ...Array.from({ length: 11 }, (_, i) => 0x2000 + i), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000];
const WS = new RegExp("[" + WS_CODES.map((c) => "\\u" + c.toString(16).padStart(4, "0")).join("") + "]", "g");

/** Khoá so khớp: NFKC rồi bỏ mọi khoảng trắng. «ｶ) ﾘﾀﾘｺ» và «カ）リタリコ» cho cùng một khoá. */
export function wrongKey(text: string): string {
  return text.normalize("NFKC").replace(WS, "");
}

export type DictIndex = ReadonlyMap<string, DictEntry>;
const slot = (field: DictField, key: string) => `${field}\n${key}`;

/** Mục theo (ô, khoá) để tra O(1). Khoá lấy từ chữ SAI (`wrong`), tính lại ở đây — không tin cột `key` của máy chủ. */
export function buildIndex(entries: readonly DictEntry[]): DictIndex {
  const m = new Map<string, DictEntry>();
  for (const e of entries) m.set(slot(e.field, wrongKey(e.wrong)), e);
  return m;
}

/**
 * Chữ nên thay cho `text` ở ô `field`, hoặc null: không có mục khớp, ô trống, hoặc ô ĐÃ đúng (đúng y chữ đáp án —
 * «カ）リタリコ» khớp khoá của mục «ｶ)ﾘﾀﾘｺ → カ）リタリコ» nhưng không cần gợi ý chính nó).
 */
export function suggestFor(index: DictIndex, field: DictField, text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const e = index.get(slot(field, wrongKey(t)));
  return e && e.right !== t ? e.right : null;
}

/** Địa chỉ một dòng. */
export type Ref = { sheet: string; block: number; row: number };

/**
 * Mọi dòng (ở các mặt sổ của hồ sơ) có chữ khớp khoá `key` ở ô `field` mà CHƯA đúng đáp án `right`. Dòng ghi chú bị bỏ.
 * Dùng cho câu hỏi «Áp dụng cho N dòng giống vậy?» và cho chế độ tự áp.
 */
export function similarRows(store: ResultStore, order: readonly string[], field: DictField, key: string, right: string): Ref[] {
  const out: Ref[] = [];
  for (const sid of order) {
    store[sid]?.blocks.forEach((block, bi) =>
      block.rows.forEach((tx, ri) => {
        if (tx.is_note) return;
        const v = shown(tx, field);
        if (typeof v !== "string") return;
        const t = v.trim();
        if (t && t !== right && wrongKey(t) === key) out.push({ sheet: sid, block: bi, row: ri });
      }),
    );
  }
  return out;
}

/**
 * Lần sửa này có đáng học không. Trả `{wrong, right}` (chữ MÁY ĐỌC → chữ người vừa gõ) hoặc null.
 * KHÔNG học khi: dòng do người thêm (không có chữ máy đọc); người XOÁ TRẮNG ô; máy không đọc ra gì (không có cặp
 * sai→đúng); hai chuỗi y hệt (sửa về đúng giá trị máy đọc).
 * Chữ máy đọc là `orig[field]` nếu ô đã từng bị sửa (giữ nguyên qua nhiều lần sửa), không thì chính chữ đang hiện.
 */
export function learnableEdit(before: Tx, field: DictField, newValue: string | null): { wrong: string; right: string } | null {
  if (before.added || before.is_note) return null;
  const right = (newValue ?? "").trim();
  if (!right) return null;
  const machine = before.orig && field in before.orig ? before.orig[field] : shown(before, field);
  const wrong = typeof machine === "string" ? machine.trim() : "";
  if (!wrong || wrong === right) return null;
  return { wrong, right };
}

/**
 * Áp `right` cho các dòng `refs` ở ô `field` (qua `applyDictEdit`: nhớ giá trị máy đọc, đánh dấu `dict_fixed`).
 * Trả lại ĐÚNG `store` cũ nếu không có gì đổi; mặt sổ không đụng tới giữ nguyên tham chiếu.
 */
export function applyToRows(store: ResultStore, refs: readonly Ref[], field: DictField, right: string): ResultStore {
  let out = store;
  for (const r of refs) {
    const data = out[r.sheet];
    const block = data?.blocks[r.block];
    if (!data || !block) continue;
    const rows = applyDictEdit(block.rows, r.row, field, right);
    if (rows === block.rows) continue;
    out = { ...out, [r.sheet]: { ...data, blocks: data.blocks.map((b, i) => (i === r.block ? { ...b, rows } : b)) } };
  }
  return out;
}

/** Chế độ «tự áp»: mọi ô khớp từ điển trong cả hồ sơ. Trả `{store, changed}`; `changed` = số ô đã đổi. */
export function autoApplyAll(
  store: ResultStore,
  order: readonly string[],
  index: DictIndex,
): { store: ResultStore; changed: number } {
  let out = store;
  let changed = 0;
  for (const sid of order) {
    out[sid]?.blocks.forEach((block, bi) =>
      block.rows.forEach((tx, ri) => {
        if (tx.is_note || tx.added) return;
        for (const field of DICT_FIELDS) {
          const right = suggestFor(index, field, shown(tx, field) as string | null);
          if (right == null) continue;
          const next = applyToRows(out, [{ sheet: sid, block: bi, row: ri }], field, right);
          if (next !== out) {
            out = next;
            changed += 1;
          }
        }
      }),
    );
  }
  return { store: out, changed };
}
