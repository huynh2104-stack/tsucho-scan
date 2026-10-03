import assert from "node:assert/strict";
import { test } from "node:test";

import type { Tx } from "./api.ts";
import { DATE_MARK, applyDateEdit, applyEdit, nearDates, newRid, parseDateInput, parseYen, shown } from "./review.ts";

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


// ── Task 1.1: danh tính dòng + giá trị máy đọc ───────────────────────

test("newRid: 12 ký tự hex, không trùng", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newRid()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-f]{12}$/);
});

test("shown: ô ngày hiện ngày ISO, không đọc được thì hiện chữ gốc; rỗng = null", () => {
  assert.equal(shown(tx(), "date"), "2025-04-11");
  assert.equal(shown(tx({ date: null, date_raw: "07-0?-11" }), "date"), "07-0?-11");
  assert.equal(shown(tx({ date: null, date_raw: null }), "date"), null);
  assert.equal(shown(tx({ description: "" }), "description"), null);
  assert.equal(shown(tx({ balance: 0 }), "balance"), 0);
});

test("sửa ô lần đầu: nhớ giá trị MÁY ĐỌC vào orig, giữ nguyên mọi trường khác", () => {
  const rows = [tx({ description: "ﾌﾘｺﾐ", rid: "aaaaaaaaaaaa" })];
  const out = applyEdit(rows, 0, "description", "フリコミ");
  assert.equal(out[0].description, "フリコミ");
  assert.deepEqual(out[0].orig, { description: "ﾌﾘｺﾐ" });
  assert.equal(out[0].rid, "aaaaaaaaaaaa");
  assert.deepEqual(rows[0].orig, undefined);                          // không đụng bản gốc
});

test("sửa lần hai: orig vẫn giữ giá trị của MÁY, không phải giá trị của lần sửa trước", () => {
  const r1 = applyEdit([tx({ balance: 1000 })], 0, "balance", 1200);
  const r2 = applyEdit(r1, 0, "balance", 1300);
  assert.deepEqual(r2[0].orig, { balance: 1000 });
  assert.equal(r2[0].balance, 1300);
});

test("sửa về đúng giá trị máy thì xoá khoá khỏi orig, và bỏ hẳn orig khi hết ô nào", () => {
  const r1 = applyEdit([tx({ balance: 1000, description: "A" })], 0, "balance", 1200);
  const r2 = applyEdit(r1, 0, "description", "B");
  assert.deepEqual(r2[0].orig, { balance: 1000, description: "A" });
  const r3 = applyEdit(r2, 0, "balance", 1000);
  assert.deepEqual(r3[0].orig, { description: "A" });
  const r4 = applyEdit(r3, 0, "description", "A");
  assert.equal("orig" in r4[0], false);
});

test("gõ lại đúng giá trị đang có: trả về CHÍNH mảng cũ (không tạo bước Ctrl+Z / autosave)", () => {
  const rows = [tx({ balance: 1000, date: "2025-04-12" })];
  assert.equal(applyEdit(rows, 0, "balance", 1000), rows);
  assert.equal(applyEdit(rows, 0, "date", "2025/4/12"), rows);          // chuẩn hoá ra đúng ngày cũ
  assert.equal(applyEdit(rows, 0, "date", "R7.4.12"), rows);
  assert.equal(applyEdit([tx({ description: null })], 0, "description", null).length, 1);
});

test("ngày: orig ghi ngày máy đọc (ISO); gõ chữ vô nghĩa vẫn ghi nhớ; gõ lại ngày máy thì hết orig", () => {
  const r1 = applyEdit([tx()], 0, "date", "tuần sau");
  assert.deepEqual(r1[0].orig, { date: "2025-04-11" });
  const r2 = applyEdit(r1, 0, "date", "07-04-11");                      // dạng in trên sổ = đúng ngày máy
  assert.equal(r2[0].date, "2025-04-11");
  assert.equal("orig" in r2[0], false);
});

test("ngày máy KHÔNG đọc được: orig ghi chữ gốc để khôi phục được", () => {
  const rows = [tx({ date: null, date_raw: "07-0?-11" })];
  const out = applyEdit(rows, 0, "date", "2025-04-11");
  assert.deepEqual(out[0].orig, { date: "07-0?-11" });
});

test("dòng do người thêm không có giá trị máy ⇒ không ghi orig", () => {
  const rows = [tx({ added: true, balance: null })];
  const out = applyEdit(rows, 0, "balance", 500);
  assert.equal(out[0].balance, 500);
  assert.equal("orig" in out[0], false);
});

test("người tự gõ ô máy đã suy ra thì ô đó không còn là 'suy ra'", () => {
  const rows = [tx({ balance: 900, inferred: ["balance"] })];
  const out = applyEdit(rows, 0, "balance", 950);
  assert.equal("inferred" in out[0], false);
  assert.deepEqual(out[0].orig, { balance: 900 });
  const giu = applyEdit([tx({ balance: 900, inferred: ["balance"] })], 0, "description", "đổi");
  assert.deepEqual(giu[0].inferred, ["balance"]);                       // sửa ô khác thì giữ nguyên
});

test("sửa dòng nào chỉ đổi dòng đó, các dòng khác giữ nguyên tham chiếu", () => {
  const rows = [tx({ rid: "1" }), tx({ rid: "2" }), tx({ rid: "3" })];
  const out = applyEdit(rows, 1, "description", "mới");
  assert.equal(out[0], rows[0]);
  assert.equal(out[2], rows[2]);
  assert.notEqual(out[1], rows[1]);
});
