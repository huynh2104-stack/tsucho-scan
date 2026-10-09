import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { DictEntry, ResultStore, Tx } from "./api.ts";
import {
  applyToRows,
  autoApplyAll,
  buildIndex,
  learnableEdit,
  similarRows,
  suggestFor,
  wrongKey,
} from "./corrections.ts";
import { applyEdit, editChanges } from "./review.ts";

const shared = JSON.parse(readFileSync(new URL("../../../tests/fixtures/dict_keys.json", import.meta.url), "utf-8")) as {
  cases: [string, string][];
};

const entry = (wrong: string, right: string, over: Partial<DictEntry> = {}): DictEntry => ({
  id: 1, field: "description", key: wrongKey(wrong), wrong, right, hits: 1, created_at: 0, updated_at: 0, ...over,
});
const tx = (description: string | null, over: Partial<Tx> = {}): Tx => ({
  date: "2025-04-25", date_raw: null, kind: null, description, extra_text: null, store_code: null,
  amount_out: null, amount_in: null, balance: null, status: "ok", sheet_id: null, ...over,
} as Tx);
const store = (sheets: Record<string, Tx[][]>): ResultStore => {
  const out: ResultStore = {};
  for (const [id, blocks] of Object.entries(sheets)) {
    out[id] = { sheet_id: id, job_id: "j", scanned_at: 0, model: null, cached: null, cost_usd: null,
      blocks: blocks.map((rows) => ({ meta: { bank_name: null, store_no: null, account_no: null, holder: null }, rows })) };
  }
  return out;
};

// ── Khoá so khớp ──────────────────────────────────────────────────────

test("wrongKey: đúng file mẫu chung với máy chủ (NFKC + bỏ khoảng trắng, cùng kết quả với api/corrections.py)", () => {
  for (const [text, key] of shared.cases) assert.equal(wrongKey(text), key, JSON.stringify(text));
});

test("wrongKey: kana nửa/toàn chữ, ngoặc toàn/nửa góc và khoảng trắng đủ loại cùng một khoá", () => {
  const k = wrongKey("ｶ)ﾘﾀﾘｺ");
  for (const v of ["カ）リタリコ", "カ) リタリコ", "カ　)　リ タ リ コ", " カ)リタリコ "]) assert.equal(wrongKey(v), k, JSON.stringify(v));
  assert.notEqual(wrongKey("カ)リタリコ"), wrongKey("カ)リタリヨ"));
});

// ── Gợi ý ─────────────────────────────────────────────────────────────

test("suggestFor: chữ khớp khoá thì gợi ý đáp án — kể cả khác kiểu chữ/khoảng trắng so với chữ đã học", () => {
  const idx = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "カ）リタリコ")]);
  assert.equal(suggestFor(idx, "description", "ｶ)ﾘﾀﾘｺ"), "カ）リタリコ");
  assert.equal(suggestFor(idx, "description", "ｶ) ﾘﾀﾘｺ"), "カ）リタリコ");
  assert.equal(suggestFor(idx, "description", "  カ)リタリコ "), "カ）リタリコ");
});

test("suggestFor: không gợi ý khi ô đã đúng, đang trống, không có mục khớp, hoặc khác ô", () => {
  const idx = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "カ）リタリコ")]);
  assert.equal(suggestFor(idx, "description", "カ）リタリコ"), null, "đã đúng y chữ đáp án");
  assert.equal(suggestFor(idx, "description", " カ）リタリコ "), null, "đúng chữ, chỉ thừa khoảng trắng hai đầu");
  assert.equal(suggestFor(idx, "description", ""), null);
  assert.equal(suggestFor(idx, "description", null), null);
  assert.equal(suggestFor(idx, "description", "ヨキンキ"), null);
  assert.equal(suggestFor(idx, "kind", "ｶ)ﾘﾀﾘｺ"), null, "mục của ô 摘要 không gợi ý cho ô 区分");
});

test("buildIndex: tính lại khoá từ chữ sai, không tin khoá do máy chủ gửi; hai mục cùng khoá thì mục sau thắng", () => {
  const idx = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "A", { key: "khoa-sai-bat-ky" })]);
  assert.equal(suggestFor(idx, "description", "カ)リタリコ"), "A");
  const idx2 = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "A"), entry("カ）リタリコ", "B", { id: 2 })]);
  assert.equal(suggestFor(idx2, "description", "ｶ)ﾘﾀﾘｺ"), "B");
});

// ── Học ───────────────────────────────────────────────────────────────

test("learnableEdit: chữ máy đọc → chữ người gõ; nhớ chữ máy đọc GỐC qua nhiều lần sửa", () => {
  assert.deepEqual(learnableEdit(tx("ｶ)ﾘﾀﾘｺ"), "description", " カ）リタリコ "), { wrong: "ｶ)ﾘﾀﾘｺ", right: "カ）リタリコ" });
  const daSuaMotLan = tx("カ)リタリコ", { orig: { description: "ｶ)ﾘﾀﾘｺ" } });
  assert.deepEqual(learnableEdit(daSuaMotLan, "description", "カ）リタリコ"), { wrong: "ｶ)ﾘﾀﾘｺ", right: "カ）リタリコ" });
});

test("learnableEdit: KHÔNG học khi xoá trắng ô, máy không đọc ra gì, dòng người thêm, ghi chú, hoặc sửa về đúng chữ máy", () => {
  assert.equal(learnableEdit(tx("ｶ)ﾘﾀﾘｺ"), "description", null), null);
  assert.equal(learnableEdit(tx("ｶ)ﾘﾀﾘｺ"), "description", "   "), null);
  assert.equal(learnableEdit(tx(null), "description", "カ）リタリコ"), null, "máy không đọc ra gì");
  assert.equal(learnableEdit(tx(""), "description", "カ）リタリコ"), null);
  assert.equal(learnableEdit(tx("ｶ)ﾘﾀﾘｺ", { added: true }), "description", "カ"), null);
  assert.equal(learnableEdit(tx("繰越", { is_note: true }), "description", "X"), null);
  assert.equal(learnableEdit(tx("ｶ)ﾘﾀﾘｺ"), "description", "ｶ)ﾘﾀﾘｺ"), null, "gõ lại đúng chữ đang có");
  assert.equal(learnableEdit(tx("カ)", { orig: { description: "ｶ)ﾘﾀﾘｺ" } }), "description", "ｶ)ﾘﾀﾘｺ"), null, "sửa về đúng chữ máy");
});

// ── Dòng giống nhau ───────────────────────────────────────────────────

test("similarRows: mọi dòng cùng khoá ở mọi mặt sổ mà chưa đúng đáp án; bỏ dòng ghi chú và dòng đã đúng", () => {
  const key = wrongKey("ｶ)ﾘﾀﾘｺ");
  const s = store({
    a: [[tx("ｶ)ﾘﾀﾘｺ"), tx("カ）リタリコ"), tx("ヨキンキ"), tx("ｶ) ﾘﾀﾘｺ")]],
    b: [[tx("ｶ)ﾘﾀﾘｺ", { is_note: true })], [tx("カ)リタリコ")]],
  });
  assert.deepEqual(similarRows(s, ["a", "b"], "description", key, "カ）リタリコ"), [
    { sheet: "a", block: 0, row: 0 },
    { sheet: "a", block: 0, row: 3 },
    { sheet: "b", block: 1, row: 0 },
  ]);
  assert.deepEqual(similarRows(s, ["b"], "description", key, "カ）リタリコ"), [{ sheet: "b", block: 1, row: 0 }], "chỉ trong các mặt sổ được hỏi");
});

// ── Áp dụng ───────────────────────────────────────────────────────────

test("applyToRows: là một lần sửa như mọi lần khác — nhớ chữ máy đọc vào orig, đánh dấu dict_fixed, giữ nguyên tham chiếu phần không đổi", () => {
  const s = store({ a: [[tx("ｶ)ﾘﾀﾘｺ"), tx("ヨキンキ")]], b: [[tx("x")]] });
  const out = applyToRows(s, [{ sheet: "a", block: 0, row: 0 }], "description", "カ）リタリコ");
  const row = out.a.blocks[0].rows[0];
  assert.equal(row.description, "カ）リタリコ");
  assert.deepEqual(row.orig, { description: "ｶ)ﾘﾀﾘｺ" });
  assert.deepEqual(row.dict_fixed, ["description"]);
  assert.equal(out.a.blocks[0].rows[1], s.a.blocks[0].rows[1]);
  assert.equal(out.b, s.b);
  assert.equal(s.a.blocks[0].rows[0].description, "ｶ)ﾘﾀﾘｺ", "kho cũ không bị sửa tại chỗ");
});

test("applyToRows: không có gì đổi (ô đã đúng / không có dòng) thì trả lại ĐÚNG kho cũ", () => {
  const s = store({ a: [[tx("カ）リタリコ")]] });
  assert.equal(applyToRows(s, [{ sheet: "a", block: 0, row: 0 }], "description", "カ）リタリコ"), s);
  assert.equal(applyToRows(s, [], "description", "x"), s);
  assert.equal(applyToRows(s, [{ sheet: "khong-co", block: 0, row: 0 }], "description", "x"), s);
});

test("dict_fixed mất khi người gõ lại ô đó; ô khác của dòng không bị ảnh hưởng", () => {
  const s = store({ a: [[tx("ｶ)ﾘﾀﾘｺ", { kind: "R" })]] });
  const fixed = applyToRows(s, [{ sheet: "a", block: 0, row: 0 }], "description", "カ）リタリコ").a.blocks[0].rows;
  assert.deepEqual(fixed[0].dict_fixed, ["description"]);
  const typed = applyEdit(fixed, 0, "description", "株式会社リタリコ")[0];
  assert.equal(typed.dict_fixed, undefined, "người đã tự gõ thì không còn là «sửa theo từ điển»");
  assert.deepEqual(typed.orig, { description: "ｶ)ﾘﾀﾘｺ" }, "chữ máy đọc gốc vẫn được nhớ");
  const khac = applyEdit(fixed, 0, "kind", "K")[0];
  assert.deepEqual(khac.dict_fixed, ["description"], "sửa ô khác không làm mất dấu của ô này");
  assert.deepEqual(editChanges(khac).map((c) => c.field), ["kind", "description"].sort((a, b) => ["date", "kind", "description"].indexOf(a) - ["date", "kind", "description"].indexOf(b)));
});

test("applyToRows: ô sửa xong lại trùng đúng chữ máy đọc thì KHÔNG đánh dấu dict_fixed", () => {
  const s = store({ a: [[tx("カ)", { orig: { description: "ｶ)ﾘﾀﾘｺ" } })]] });
  const out = applyToRows(s, [{ sheet: "a", block: 0, row: 0 }], "description", "ｶ)ﾘﾀﾘｺ");
  const row = out.a.blocks[0].rows[0];
  assert.equal(row.description, "ｶ)ﾘﾀﾘｺ");
  assert.equal(row.dict_fixed, undefined);
  assert.equal(row.orig, undefined);
});

// ── Chế độ tự áp ──────────────────────────────────────────────────────

test("autoApplyAll: áp mọi ô khớp trong cả hồ sơ, đếm số ô đổi; ô đã đúng / dòng ghi chú / dòng người thêm không bị đụng", () => {
  const idx = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "カ）リタリコ")]);
  const s = store({
    a: [[tx("ｶ)ﾘﾀﾘｺ"), tx("カ）リタリコ"), tx("ｶ)ﾘﾀﾘｺ", { is_note: true }), tx("ｶ)ﾘﾀﾘｺ", { added: true })]],
    b: [[tx("ｶ) ﾘﾀﾘｺ")]],
  });
  const { store: out, changed } = autoApplyAll(s, ["a", "b"], idx);
  assert.equal(changed, 2);
  assert.equal(out.a.blocks[0].rows[0].description, "カ）リタリコ");
  assert.equal(out.b.blocks[0].rows[0].description, "カ）リタリコ");
  assert.equal(out.a.blocks[0].rows[1], s.a.blocks[0].rows[1]);
  assert.equal(out.a.blocks[0].rows[2], s.a.blocks[0].rows[2]);
  assert.equal(out.a.blocks[0].rows[3], s.a.blocks[0].rows[3]);
  assert.deepEqual(out.b.blocks[0].rows[0].dict_fixed, ["description"]);
});

test("autoApplyAll: chạy lần hai không đổi gì (ổn định); từ điển rỗng thì trả lại đúng kho cũ", () => {
  const idx = buildIndex([entry("ｶ)ﾘﾀﾘｺ", "カ）リタリコ")]);
  const s = store({ a: [[tx("ｶ)ﾘﾀﾘｺ")]] });
  const once = autoApplyAll(s, ["a"], idx);
  const twice = autoApplyAll(once.store, ["a"], idx);
  assert.equal(twice.changed, 0);
  assert.equal(twice.store, once.store);
  const none = autoApplyAll(s, ["a"], buildIndex([]));
  assert.deepEqual([none.changed, none.store === s], [0, true]);
});
