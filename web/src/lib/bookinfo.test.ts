import assert from "node:assert/strict";
import { test } from "node:test";

import type { AccountMeta, ResultStore } from "./api.ts";
import {
  META_INPUT_MAX,
  applyMetaEdit,
  cleanField,
  draftOf,
  followersOf,
  hasInfo,
  metaFromDraft,
} from "./bookinfo.ts";

const NONE: AccountMeta = { bank_name: null, store_no: null, account_no: null, holder: null };
const m = (over: Partial<AccountMeta> = {}): AccountMeta => ({ ...NONE, ...over });

/** Kho mẫu: mỗi mặt sổ là danh sách meta của các khối của nó (null = chưa quét, không có kết quả). */
function store(spec: Record<string, AccountMeta[] | null>): ResultStore {
  const out: ResultStore = {};
  for (const [sid, metas] of Object.entries(spec)) {
    if (!metas) continue;
    out[sid] = { sheet_id: sid, job_id: "j", scanned_at: 0, model: null, cached: null, cost_usd: null,
      blocks: metas.map((meta) => ({ meta, rows: [] })) };
  }
  return out;
}
const draft = (over: Partial<ReturnType<typeof draftOf>> = {}) => ({ ...draftOf(NONE), ...over });
const ORDER = ["s1", "s2", "s3", "s4"];
const metaOf = (s: ResultStore, sid: string, bi = 0) => s[sid].blocks[bi].meta;

test("cleanField: cắt khoảng trắng (kể cả toàn góc), trống → null, số tài khoản đổi số toàn góc về số thường", () => {
  assert.equal(cleanField("bank_name", "  見本銀行　"), "見本銀行");
  assert.equal(cleanField("holder", "   "), null);
  assert.equal(cleanField("holder", ""), null);
  assert.equal(cleanField("account_no", " ０１２３４５６ "), "0123456");
  assert.equal(cleanField("store_no", "００１"), "001");
  assert.equal(cleanField("bank_name", "ＡＢＣ銀行"), "ＡＢＣ銀行", "tên ngân hàng KHÔNG đổi chữ toàn góc");
});

test("cleanField: cắt theo trần độ dài bằng ký tự, không cắt đôi cặp thay thế", () => {
  const hanHiem = "𠮷";                                    // 1 ký tự = 2 đơn vị UTF-16
  const out = cleanField("holder", hanHiem.repeat(META_INPUT_MAX + 5)) as string;
  assert.equal(Array.from(out).length, META_INPUT_MAX);
  assert.ok(Array.from(out).every((c) => c === hanHiem), "không có nửa ký tự");
});

test("draftOf / metaFromDraft: khứ hồi, null ↔ chuỗi rỗng", () => {
  const meta = m({ bank_name: "A", account_no: "123" });
  assert.deepEqual(draftOf(meta), { bank_name: "A", store_no: "", account_no: "123", holder: "" });
  assert.deepEqual(metaFromDraft(draftOf(meta)), meta);
});

test("hasInfo: chỉ tên ngân hàng HOẶC số tài khoản mới tính; cửa hàng/tên chủ thì chưa", () => {
  assert.equal(hasInfo(NONE), false);
  assert.equal(hasInfo(m({ store_no: "001", holder: "ヤマダ" })), false);
  assert.equal(hasInfo(m({ bank_name: "A" })), true);
  assert.equal(hasInfo(m({ account_no: "1" })), true);
  assert.equal(hasInfo(m({ bank_name: "  " })), false, "toàn khoảng trắng coi như trống");
});

test("followersOf: lần lượt các mặt sau chưa có thông tin, dừng ở mặt đầu tiên đã có", () => {
  const s = store({ s1: [m({ bank_name: "A" })], s2: [NONE], s3: [NONE], s4: [m({ bank_name: "B" })] });
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 0 }), [
    { sheet: "s2", block: 0 },
    { sheet: "s3", block: 0 },
  ]);
});

test("followersOf: mặt chưa quét bị bỏ qua (không dừng); khối đứng đầu danh sách không có gì trước nó", () => {
  const s = store({ s1: [NONE], s2: null, s3: [NONE], s4: null });
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 0 }), [{ sheet: "s3", block: 0 }]);
});

test("followersOf: chỉ khối CUỐI của mặt sổ nối sang mặt sau", () => {
  const s = store({ s1: [NONE, NONE], s2: [NONE] });
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 0 }), [], "khối đầu của mặt có hai sổ: không nối");
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 1 }), [{ sheet: "s2", block: 0 }]);
});

test("followersOf: dừng ở mặt có hai sổ trong một ảnh (không biết sổ nào nối tiếp)", () => {
  const s = store({ s1: [NONE], s2: [NONE], s3: [NONE, NONE], s4: [NONE] });
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 0 }), [{ sheet: "s2", block: 0 }]);
});

test("followersOf: mặt sổ không có trong danh sách / khối không tồn tại → không có gì", () => {
  const s = store({ s1: [NONE], s2: [NONE] });
  assert.deepEqual(followersOf(["s2"], s, { sheet: "s1", block: 0 }), []);
  assert.deepEqual(followersOf(ORDER, s, { sheet: "s1", block: 5 }), []);
  assert.deepEqual(followersOf(ORDER, s, { sheet: "khong-co", block: 0 }), []);
});

test("applyMetaEdit: sửa khối đó, gắn edited, giữ nguyên tham chiếu mặt sổ khác", () => {
  const s = store({ s1: [m({ bank_name: "Cũ", account_no: "1" })], s2: [m({ bank_name: "Khác" })] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ bank_name: "Mới", account_no: "1" }), false);
  assert.deepEqual(metaOf(out, "s1"), { bank_name: "Mới", store_no: null, account_no: "1", holder: null, edited: true });
  assert.equal(out.s2, s.s2, "mặt sổ không đụng tới giữ nguyên tham chiếu");
  assert.equal(metaOf(s, "s1").bank_name, "Cũ", "kho cũ không bị sửa tại chỗ");
});

test("applyMetaEdit: không có gì đổi ⇒ trả lại ĐÚNG kho cũ (không tạo bước Ctrl+Z)", () => {
  const meta = m({ bank_name: "A", account_no: "1" });
  const s = store({ s1: [meta], s2: [NONE] });
  assert.equal(applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draftOf(meta), false), s);
  // gõ thêm khoảng trắng thừa cũng vẫn là «không đổi»
  assert.equal(applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ bank_name: " A ", account_no: "１" }), false), s);
  assert.equal(applyMetaEdit(ORDER, s, { sheet: "khong-co", block: 0 }, draft({ bank_name: "X" }), true), s);
});

test("applyMetaEdit: áp cho các mặt sau chưa có thông tin, dừng ở mặt đã có; edited ở mọi khối đã đổi", () => {
  const s = store({ s1: [NONE], s2: [NONE], s3: [NONE], s4: [m({ bank_name: "Sổ khác" })] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ bank_name: "Mới", account_no: "99" }), true);
  for (const sid of ["s1", "s2", "s3"]) {
    assert.equal(metaOf(out, sid).bank_name, "Mới", sid);
    assert.equal(metaOf(out, sid).account_no, "99", sid);
    assert.equal(metaOf(out, sid).edited, true, sid);
  }
  assert.equal(out.s4, s.s4, "dừng ở mặt đã có thông tin riêng");
});

test("applyMetaEdit: tắt «áp cho mặt sau» thì chỉ khối được sửa đổi", () => {
  const s = store({ s1: [NONE], s2: [NONE] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ bank_name: "Mới" }), false);
  assert.equal(metaOf(out, "s1").bank_name, "Mới");
  assert.equal(out.s2, s.s2);
});

test("applyMetaEdit: mặt sau chỉ được ĐIỀN CHỖ TRỐNG — ô đã có chữ (vd tên chủ) giữ nguyên", () => {
  const s = store({ s1: [NONE], s2: [m({ holder: "ヤマダ タロウ", store_no: "007" })] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ bank_name: "A", store_no: "001", holder: "Khác" }), true);
  assert.deepEqual(metaOf(out, "s2"), { bank_name: "A", store_no: "007", account_no: null, holder: "ヤマダ タロウ", edited: true });
});

test("applyMetaEdit: khối được sửa KHÔNG đổi nhưng bật áp dụng ⇒ vẫn điền cho mặt sau (và không gắn edited cho khối nó)", () => {
  const meta = m({ bank_name: "A", account_no: "1" });
  const s = store({ s1: [meta], s2: [NONE] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draftOf(meta), true);
  assert.equal(out.s1, s.s1);
  assert.equal(metaOf(out, "s2").bank_name, "A");
  assert.equal(metaOf(out, "s2").edited, true);
});

test("applyMetaEdit: xoá trắng một ô thì thành null; xoá hết bốn ô thì mặt sau không bị điền gì", () => {
  const s = store({ s1: [m({ bank_name: "A", account_no: "1", holder: "H" })], s2: [NONE] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft(), true);
  assert.deepEqual(metaOf(out, "s1"), { bank_name: null, store_no: null, account_no: null, holder: null, edited: true });
  assert.equal(out.s2, s.s2, "không có gì để điền");
});

test("applyMetaEdit: giữ khoá lạ của meta (phiên bản sau) và không đụng tới dòng", () => {
  const rows = [{ date: null } as never];
  const base = store({ s1: [m({ bank_name: "A" })] });
  base.s1.blocks[0] = { meta: { ...m({ bank_name: "A" }), khoa_tuong_lai: 7 } as AccountMeta, rows };
  const out = applyMetaEdit(ORDER, base, { sheet: "s1", block: 0 }, draft({ bank_name: "B" }), false);
  assert.equal((metaOf(out, "s1") as Record<string, unknown>).khoa_tuong_lai, 7);
  assert.equal(out.s1.blocks[0].rows, rows, "mảng dòng giữ nguyên tham chiếu");
});

test("applyMetaEdit: số tài khoản gõ toàn góc được lưu dạng số thường (để gộp sổ/kiểm chỗ nối so khớp)", () => {
  const s = store({ s1: [NONE] });
  const out = applyMetaEdit(ORDER, s, { sheet: "s1", block: 0 }, draft({ account_no: "０１２－３４" }), false);
  assert.equal(metaOf(out, "s1").account_no, "012-34");
});
