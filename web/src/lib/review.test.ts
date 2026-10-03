import assert from "node:assert/strict";
import { test } from "node:test";

import type { Tx } from "./api.ts";
import { DATE_MARK, applyDateEdit, nearDates, parseDateInput, parseYen } from "./review.ts";

// ── parseDateInput ───────────────────────────────────────────────────

test("ngày dương lịch đủ năm, nhiều kiểu ngăn cách", () => {
  for (const s of ["2025-04-11", "2025/4/11", "2025.4.11", "2025年4月11日", "20250411", " 2025 / 4 / 11 "]) {
    assert.equal(parseDateInput(s), "2025-04-11", s);
  }
});

test("số toàn góc của IME tiếng Nhật được chuẩn hoá", () => {
  assert.equal(parseDateInput("２０２５／４／１１"), "2025-04-11");
  assert.equal(parseDateInput("Ｒ７．４．１１"), "2025-04-11");
  assert.equal(parseDateInput("㋿7.4.11"), "2025-04-11");           // ㋿ = 令和
});

test("niên hiệu: chữ cái, chữ Hán, 元 năm", () => {
  assert.equal(parseDateInput("R7.4.11"), "2025-04-11");
  assert.equal(parseDateInput("r7.4.11"), "2025-04-11");
  assert.equal(parseDateInput("令和7年4月11日"), "2025-04-11");
  assert.equal(parseDateInput("令和元年5月1日"), "2019-05-01");
  assert.equal(parseDateInput("H31.4.30"), "2019-04-30");
  assert.equal(parseDateInput("平成31年4月30日"), "2019-04-30");
  assert.equal(parseDateInput("S63.1.5"), "1988-01-05");
  assert.equal(parseDateInput("H32.1.1"), null);                    // 平成 chỉ có 31 năm
});

test("dạng in trên sổ 07-04-11: mặc định 令和, nhưng theo niên hiệu của dòng bên cạnh", () => {
  assert.equal(parseDateInput("07-04-11"), "2025-04-11");
  assert.equal(parseDateInput("7-04-30"), "2025-04-30");            // ゆうちょ in năm 1 chữ số
  assert.equal(parseDateInput("07-04-11", { prev: "1995-03-01" }), "1995-04-11");   // 平成7
  assert.equal(parseDateInput("63-04-11", { prev: "1988-03-01" }), "1988-04-11");   // 昭和63
  assert.equal(parseDateInput("07-04-11", { next: "2025-05-01" }), "2025-04-11");
  assert.equal(parseDateInput("25/4/11", { prev: "2025-03-01" }), "2025-04-11");    // năm dương 2 chữ số
});

test("4/11: suy năm từ dòng trước và dòng sau", () => {
  assert.equal(parseDateInput("4/11", { prev: "2025-03-30" }), "2025-04-11");
  assert.equal(parseDateInput("1/5", { prev: "2025-12-30" }), "2026-01-05");        // sang năm
  assert.equal(parseDateInput("4/30", { next: "2025-04-12" }), "2024-04-30");       // chỉ có dòng sau
  assert.equal(parseDateInput("3/1", { next: "2025-04-12" }), "2025-03-01");        // hoà ⇒ năm muộn
  assert.equal(parseDateInput("4月11日", { prev: "2025-03-30" }), "2025-04-11");
  assert.equal(parseDateInput("4/15", { prev: "2025-04-11", next: "2025-04-20" }), "2025-04-15");
  assert.equal(parseDateInput("4/11"), null);                       // không có dòng nào để suy năm
});

test("không đọc được thì trả null, không đoán bừa", () => {
  for (const s of ["", "   ", "abc", "2025/13/40", "2025-02-30", "R7.2.30", "13/45", "2025/4", "ngày mai"]) {
    assert.equal(parseDateInput(s, { prev: "2025-03-01" }), null, JSON.stringify(s));
  }
});

// ── parseYen ─────────────────────────────────────────────────────────

test("số tiền: toàn góc, dấu phẩy các kiểu, ¥ và 円", () => {
  const ok = (s: string, v: number | null) => assert.deepEqual(parseYen(s), { ok: true, value: v }, s);
  ok("１，２３４", 1234);
  ok("1,234", 1234);
  ok("1234", 1234);
  ok("￥１，２３４", 1234);
  ok("¥1,234", 1234);
  ok("1,234円", 1234);
  ok("１２３４円", 1234);
  ok(" 1 234 ", 1234);
  ok("0", 0);
});

test("ô trống hoặc chỉ có gạch ngang = không có số", () => {
  for (const s of ["", "  ", "-", "－", "ー", "―"]) assert.deepEqual(parseYen(s), { ok: true, value: null }, s);
});

test("số âm, ▲, số lẻ, chữ: không nhận (giữ giá trị cũ)", () => {
  for (const s of ["▲500", "△500", "-500", "－500", "12.5", "abc", "1,2a", "9".repeat(20)]) {
    assert.deepEqual(parseYen(s), { ok: false }, s);
  }
});

// ── applyDateEdit ────────────────────────────────────────────────────

const tx = (over: Partial<Tx> = {}): Tx => ({
  date: "2025-04-11", date_raw: "07-04-11", kind: null, description: "x", extra_text: null,
  store_code: null, amount_out: null, amount_in: null, balance: 100, status: "ok", reason: "",
  sheet_id: null, ...over,
});

test("gõ ngày đọc được: ghi ISO, dòng giữ nguyên trạng thái", () => {
  const rows = [tx({ date: "2025-04-10" }), tx(), tx({ date: "2025-04-12" })];
  const r = applyDateEdit(rows, 1, "2025/4/11");
  assert.equal(r.date, "2025-04-11");
  assert.equal(r.status, "ok");
  assert.equal(rows[1].date, "2025-04-11");                         // không đụng bản gốc
});

test("gõ ngày không đọc được: date null, giữ chuỗi gõ, dòng chuyển sang cần soát", () => {
  const r = applyDateEdit([tx()], 0, "tuần sau");
  assert.equal(r.date, null);
  assert.equal(r.date_raw, "tuần sau");
  assert.equal(r.status, "check");
  assert.equal(r.reason, DATE_MARK);
});

test("sửa lại thành ngày đúng thì gỡ lý do ngày, trả dòng về ok", () => {
  const sai = applyDateEdit([tx()], 0, "tuần sau");
  const dung = applyDateEdit([sai], 0, "R7.4.11");
  assert.deepEqual([dung.date, dung.status, dung.reason], ["2025-04-11", "ok", ""]);
});

test("lý do 日付不明 của engine cũng được gỡ khi người dùng điền ngày đúng, lý do khác thì giữ", () => {
  const engine = tx({ date: null, status: "check", reason: "日付不明" });
  assert.equal(applyDateEdit([engine], 0, "2025-04-11").status, "ok");
  const hai = tx({ date: null, status: "check", reason: "日付不明・低信頼度" });
  const r = applyDateEdit([hai], 0, "2025-04-11");
  assert.deepEqual([r.status, r.reason], ["check", "低信頼度"]);
});

test("gõ sai ngày trên dòng đã có lý do khác: thêm lý do, không mất lý do cũ", () => {
  const r = applyDateEdit([tx({ status: "check", reason: "低信頼度" })], 0, "???");
  assert.equal(r.reason, `低信頼度・${DATE_MARK}`);
});

test("dòng ghi chú không bị tô vàng vì ngày trống", () => {
  const r = applyDateEdit([tx({ is_note: true, status: "note" })], 0, "");
  assert.deepEqual([r.date, r.status, r.reason ?? ""], [null, "note", ""]);
});

test("nearDates bỏ qua dòng chưa có ngày hợp lệ", () => {
  const rows = [tx({ date: "2025-01-01" }), tx({ date: null }), tx({ date: "tuần sau" }), tx(), tx({ date: null })];
  assert.deepEqual(nearDates(rows, 3), { prev: "2025-01-01", next: null });
});
