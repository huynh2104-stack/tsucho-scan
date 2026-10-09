/**
 * Sửa thông tin sổ (銀行名 / 店番号 / 口座番号 / 名義) — task 2.3. Logic thuần, có test (`bookinfo.test.ts`).
 *
 * Vì sao có: sổ không có trang bìa thì máy không biết tên ngân hàng/số tài khoản, khối đầu mỗi sheet Excel ghi «―»,
 * và «xuất theo tài khoản» cũng không gom được vì `account_no` rỗng. Người dùng điền tay một lần ở đây.
 */

import type { AccountMeta, ResultStore } from "./api.ts";

export const META_FIELDS = ["bank_name", "store_no", "account_no", "holder"] as const;
export type MetaField = (typeof META_FIELDS)[number];
export type MetaDraft = Record<MetaField, string>;

/** Địa chỉ một khối (một sổ) trong kho kết quả: id mặt sổ + chỉ số khối. */
export type BlockRef = { sheet: string; block: number };

/** Trần độ dài khi gõ. Máy chủ chấp nhận tới 200 — giá trị thật chỉ vài ký tự, trần chỉ chặn dữ liệu rác. */
export const META_INPUT_MAX = 100;

/** Meta → nội dung các ô nhập (null thành chuỗi rỗng). */
export function draftOf(meta: AccountMeta): MetaDraft {
  return {
    bank_name: meta.bank_name ?? "",
    store_no: meta.store_no ?? "",
    account_no: meta.account_no ?? "",
    holder: meta.holder ?? "",
  };
}

/**
 * Chuẩn hoá một ô gõ tay thành giá trị lưu: cắt khoảng trắng hai đầu (kể cả dấu cách toàn góc), cắt theo trần độ
 * dài, trống thì thành `null`. Số cửa hàng / số tài khoản còn đổi số toàn góc ０１２ về số thường (NFKC): người
 * Nhật gõ lẫn hai kiểu, mà việc gộp sổ và kiểm chỗ nối so sánh CHUỖI nên phải cùng một kiểu.
 */
export function cleanField(field: MetaField, raw: string): string | null {
  let v = raw.trim();
  if (field === "account_no" || field === "store_no") v = v.normalize("NFKC").trim();
  v = Array.from(v).slice(0, META_INPUT_MAX).join("");     // theo ký tự, không cắt đôi một chữ Hán hiếm (cặp thay thế)
  return v === "" ? null : v;
}

/** Các ô nhập → meta sẽ lưu (chưa gắn cờ `edited`). */
export function metaFromDraft(draft: MetaDraft): AccountMeta {
  return {
    bank_name: cleanField("bank_name", draft.bank_name),
    store_no: cleanField("store_no", draft.store_no),
    account_no: cleanField("account_no", draft.account_no),
    holder: cleanField("holder", draft.holder),
  };
}

/** Khối đã có thông tin riêng chưa: có tên ngân hàng HOẶC số tài khoản (đúng nghĩa «chưa có thông tin» ở kế hoạch). */
export function hasInfo(meta: AccountMeta): boolean {
  return !!(meta.bank_name?.trim() || meta.account_no?.trim());
}

const sameFields = (a: AccountMeta, b: AccountMeta) =>
  META_FIELDS.every((k) => (a[k] ?? null) === (b[k] ?? null));

/**
 * Những khối «liền sau» sẽ được điền theo khối `ref` — đúng tinh thần `validate.apply_cover_metadata` (thông tin ở
 * bìa lan sang các trang sau cho tới bìa kế tiếp), nhưng CHẶT hơn vì ở đây người dùng nhìn thấy kết quả và máy
 * không đoán bừa:
 * - chỉ khối CUỐI của mặt sổ mới nối sang mặt sau (mặt có hai sổ thì sổ đứng trước không liên quan mặt kế);
 * - đi lần lượt các mặt sau theo thứ tự cột trái, bỏ qua mặt chưa quét;
 * - DỪNG ở mặt có từ hai sổ trở lên trong một ảnh (không biết sổ nào nối tiếp) hoặc ở khối đã có thông tin riêng.
 */
export function followersOf(order: string[], store: ResultStore, ref: BlockRef): BlockRef[] {
  const own = store[ref.sheet];
  const start = order.indexOf(ref.sheet);
  if (start < 0 || !own || ref.block !== own.blocks.length - 1) return [];
  const out: BlockRef[] = [];
  for (let i = start + 1; i < order.length; i++) {
    const data = store[order[i]];
    if (!data || data.blocks.length === 0) continue;       // chưa quét: bỏ qua
    if (data.blocks.length > 1) break;                      // hai sổ trong một ảnh: không biết sổ nào nối tiếp
    if (hasInfo(data.blocks[0].meta)) break;                // đã có thông tin riêng ⇒ sổ khác
    out.push({ sheet: order[i], block: 0 });
  }
  return out;
}

/**
 * Áp bản người dùng vừa sửa. Trả lại ĐÚNG `store` cũ nếu không có gì đổi (để không tạo bước Ctrl+Z / lượt lưu rỗng);
 * mặt sổ không đổi giữ nguyên tham chiếu.
 *
 * - Khối được sửa: thay đủ bốn trường (xoá trắng một ô thì thành `null`), gắn `edited: true` — chỉ khi thật sự khác.
 * - `propagate`: các khối `followersOf` được ĐIỀN CHỖ TRỐNG (ô nào đã có chữ thì giữ), cũng gắn `edited: true`.
 */
export function applyMetaEdit(
  order: string[],
  store: ResultStore,
  ref: BlockRef,
  draft: MetaDraft,
  propagate: boolean,
): ResultStore {
  const cur = store[ref.sheet]?.blocks[ref.block];
  if (!cur) return store;
  const meta = metaFromDraft(draft);

  let out = store;
  const setMeta = (sheet: string, block: number, next: AccountMeta) => {
    const data = out[sheet];
    out = {
      ...out,
      [sheet]: { ...data, blocks: data.blocks.map((b, i) => (i === block ? { ...b, meta: next } : b)) },
    };
  };

  if (!sameFields(cur.meta, meta)) setMeta(ref.sheet, ref.block, { ...cur.meta, ...meta, edited: true });

  if (propagate) {
    for (const f of followersOf(order, store, ref)) {
      const fm = out[f.sheet].blocks[f.block].meta;
      const filled: AccountMeta = {
        bank_name: fm.bank_name || meta.bank_name,
        store_no: fm.store_no || meta.store_no,
        account_no: fm.account_no || meta.account_no,
        holder: fm.holder || meta.holder,
      };
      if (!sameFields(fm, filled)) setMeta(f.sheet, f.block, { ...fm, ...filled, edited: true });
    }
  }
  return out;
}
