import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Tx } from "./api.ts";
import {
  analyzeRows,
  applyDateEdit,
  applyEdit,
  blankRow,
  chainChecks,
  editChanges,
  focusField,
  insertRowAfter,
  ngCount,
  needsReview,
  nearDates,
  newRid,
  openReasons,
  parseDateInput,
  parseReasons,
  parseYen,
  restoreField,
  rowState,
  setAllReviewed,
  setReviewed,
  sheetStats,
  shown,
} from "./review.ts";

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

test("gõ ngày không đọc được: date null, giữ chuỗi gõ; status/reason (dữ kiện của máy) KHÔNG đổi", () => {
  const goc = tx();
  const r = applyDateEdit([goc], 0, "tuần sau");
  assert.equal(r.date, null);
  assert.equal(r.date_raw, "tuần sau");
  assert.deepEqual([r.status, r.reason], [goc.status, goc.reason]);
  assert.equal(needsReview(r, "OK"), true);                          // nhưng dòng vẫn tự thành cần soát
  assert.deepEqual(openReasons(r, "OK").map((x) => x.kind), ["date"]);
});

test("sửa lại thành ngày đúng: dòng hết cần soát mà không cần ai đụng vào status/reason", () => {
  const sai = applyDateEdit([tx()], 0, "tuần sau");
  const dung = applyDateEdit([sai], 0, "R7.4.11");
  assert.deepEqual([dung.date, dung.status, dung.reason], ["2025-04-11", "ok", ""]);
  assert.equal(needsReview(dung, "OK"), false);
});

test("lý do 日付不明 của engine hết hiệu lực khi có ngày đúng, lý do khác thì vẫn giữ dòng ở cần soát", () => {
  const engine = tx({ date: null, status: "check", reason: "日付不明" });
  const dung = applyDateEdit([engine], 0, "2025-04-11");
  assert.deepEqual([dung.status, dung.reason], ["check", "日付不明"]);   // máy ghi gì giữ nguyên
  assert.equal(needsReview(dung, "OK"), false);
  const hai = applyDateEdit([tx({ date: null, status: "check", reason: "日付不明・低信頼度" })], 0, "2025-04-11");
  assert.equal(hai.reason, "日付不明・低信頼度");
  assert.deepEqual(openReasons(hai, "OK").map((x) => x.kind), ["lowconf"]);
  assert.equal(needsReview(hai, "OK"), true);
});

test("gõ sai ngày trên dòng đã có lý do khác: lý do cũ giữ nguyên, thêm ngày vào danh sách còn mở", () => {
  const r = applyDateEdit([tx({ status: "check", reason: "低信頼度" })], 0, "???");
  assert.equal(r.reason, "低信頼度");
  assert.deepEqual(openReasons(r, "OK").map((x) => x.kind), ["date", "lowconf"]);
});

test("xoá trắng ô ngày của dòng thường: cần soát; dòng ghi chú thì không", () => {
  const trong = applyDateEdit([tx()], 0, "  ");
  assert.deepEqual([trong.date, trong.date_raw], [null, null]);
  assert.equal(needsReview(trong, "OK"), true);
  const ghiChu = applyDateEdit([tx({ is_note: true, status: "note" })], 0, "");
  assert.deepEqual([ghiChu.date, ghiChu.status, ghiChu.reason ?? ""], [null, "note", ""]);
  assert.equal(needsReview(ghiChu, "―"), false);
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


// ── Task 1.2: một định nghĩa「cần soát」— cùng bộ ca JSON với tests/test_review.py ──

type Case = {
  name: string;
  rows?: Partial<Tx>[];
  blocks?: Partial<Tx>[][];
  expect: {
    chk: string[];
    need: boolean[];
    state: string[];
    focus?: (string | null)[];
    open?: (string[] | null)[];
    stats?: Record<string, number>;
  };
};
type Fixture = {
  defaults: Partial<Tx>;
  cases: Case[];
  reasons: { reason: string | null; kinds: string[]; params?: Record<string, number>[] }[];
};

const FIXTURE: Fixture = JSON.parse(
  readFileSync(new URL("../../../tests/fixtures/review_cases.json", import.meta.url), "utf8"),
);
const full = (r: Partial<Tx>): Tx => ({ ...FIXTURE.defaults, ...r }) as Tx;

test("bộ ca dùng chung đủ lớn", () => {
  assert.ok(FIXTURE.cases.length >= 14);
  assert.ok(FIXTURE.reasons.length >= 20);
});

for (const [i, c] of FIXTURE.cases.entries()) {
  test(`ca dùng chung ${String(i + 1).padStart(2, "0")}: ${c.name}`, () => {
    const blocks = (c.blocks ?? [c.rows ?? []]).map((b) => b.map(full));
    const rows = blocks.flat();
    const infos = blocks.flatMap((b) => analyzeRows(b));
    for (const key of ["chk", "need", "state", "focus", "open"] as const) {
      const want = c.expect[key];
      if (want) assert.equal(want.length, rows.length, `expect.${key} lệch số dòng`);
    }

    assert.deepEqual(infos.map((x) => x.chk), c.expect.chk, "chk");
    assert.deepEqual(infos.map((x) => x.need), c.expect.need, "need");
    assert.deepEqual(infos.map((x) => x.state), c.expect.state, "state");
    assert.deepEqual(infos.map((x) => x.need), infos.map((x) => x.state === "review"));

    c.expect.focus?.forEach((want, k) => {
      if (want !== null) assert.equal(infos[k].field, want, `focus dòng ${k}`);
    });
    if (c.expect.open) {
      const got = blocks.flatMap((b) => {
        const chk = chainChecks(b);
        return b.map((tx, k) => openReasons(tx, chk[k]).map((r) => r.kind));
      });
      c.expect.open.forEach((want, k) => {
        if (want !== null) assert.deepEqual(got[k], want, `open dòng ${k}`);
      });
    }
    if (c.expect.stats) assert.deepEqual(sheetStats(blocks.map((b) => ({ rows: b }))), c.expect.stats, "stats");
  });
}

for (const [i, c] of FIXTURE.reasons.entries()) {
  test(`phân loại lý do ${String(i + 1).padStart(2, "0")}: ${JSON.stringify(c.reason)}`, () => {
    const got = parseReasons(c.reason);
    assert.deepEqual(got.map((r) => r.kind), c.kinds);
    if (c.params) assert.deepEqual(got.map((r) => r.params), c.params);
  });
}

test("parseReasons giữ nguyên chữ từng phần và bỏ khoảng trắng thừa", () => {
  assert.deepEqual(parseReasons(" 低信頼度 ・日付不明 ").map((r) => r.text), ["低信頼度", "日付不明"]);
});

test("chainChecks / rowState / focusField gọi lẻ cho kết quả y hệt analyzeRows", () => {
  const rows = [
    full({ balance: 1000 }),
    full({ amount_out: 100, balance: 999 }),
    full({ amount_in: 50, balance: 1049, status: "check", reason: "低信頼度" }),
  ];
  const chk = chainChecks(rows);
  const info = analyzeRows(rows);
  rows.forEach((tx, k) => {
    assert.equal(info[k].chk, chk[k]);
    assert.equal(info[k].state, rowState(tx, chk[k]));
    assert.equal(info[k].field, focusField(tx, chk[k]));
    assert.equal(info[k].need, needsReview(tx, chk[k]));
  });
});

test("đổi một ô thì dòng đó hết/lên cần soát ngay, các dòng khác không bị đụng", () => {
  const rows = [
    full({ balance: 1000 }),
    full({ amount_out: 100, balance: 900 }),
    full({ amount_in: 50, balance: 950 }),
  ];
  assert.equal(sheetStats([{ rows }]).need, 0);
  const sai = applyEdit(rows, 1, "balance", 999);
  assert.equal(sheetStats([{ rows: sai }]).need, 2);                // dòng sửa sai + dòng kế bị lệch theo
  assert.deepEqual(sai[1].orig, { balance: 900 });
  const dung = applyEdit(sai, 1, "balance", 900);
  assert.equal(sheetStats([{ rows: dung }]).need, 0);               // sửa lại đúng ⇒ hết vàng
  assert.equal("orig" in dung[1], false);
});

test("applyEdit không bao giờ đụng status/reason, kể cả khi sửa ô ngày", () => {
  const rows = [full({ date: null, status: "check", reason: "日付不明・低信頼度" })];
  for (const [f, v] of [["date", "2025/4/11"], ["description", "mới"], ["balance", 5]] as const) {
    const out = applyEdit(rows, 0, f, v);
    assert.equal(out[0].status, "check", f);
    assert.equal(out[0].reason, "日付不明・低信頼度", f);
  }
});

test("setReviewed: bấm ✓ rồi bỏ ✓, ghi/xoá hẳn hai khoá, không đụng bản gốc", () => {
  const rows = [full({ rid: "a" }), full({ rid: "b" })];
  const on = setReviewed(rows, 1, true, 1700000000);
  assert.deepEqual([on[1].reviewed, on[1].reviewed_at], [true, 1700000000]);
  assert.equal(on[0], rows[0]);
  assert.equal("reviewed" in rows[1], false);
  const off = setReviewed(on, 1, false, 1700000001);
  assert.equal("reviewed" in off[1], false);
  assert.equal("reviewed_at" in off[1], false);
  assert.deepEqual(off[1], rows[1]);
});

test("setReviewed: đã ở đúng trạng thái, hoặc là dòng ghi chú, thì trả CHÍNH mảng cũ", () => {
  const rows = [full({ is_note: true, status: "note" }), full({ reviewed: true, reviewed_at: 5 })];
  assert.equal(setReviewed(rows, 0, true, 9), rows);                // ghi chú không có ✓
  assert.equal(setReviewed(rows, 1, true, 9), rows);                // đã ✓ rồi: giữ nguyên thời điểm cũ
  assert.equal(setReviewed(rows, 1, true, 9)[1].reviewed_at, 5);
  assert.equal(setReviewed([full({})], 0, false, 9).length, 1);       // chưa ✓ mà bỏ ✓: không đổi
  assert.equal(setReviewed(rows, 7, true, 9), rows);                // chỉ số lạ không nổ
});

test("✓ rồi sửa tiếp ô khác: vẫn giữ ✓ (người đã nhìn dòng này)", () => {
  const rows = setReviewed([full({ balance: 100 })], 0, true, 1);
  const out = applyEdit(rows, 0, "description", "khác");
  assert.equal(out[0].reviewed, true);
  assert.equal(rowState(out[0], "―"), "confirmed");
});


// ── Task 1.3: xác nhận cả mặt, chèn dòng đúng chỗ, khôi phục giá trị máy ───────

test("setAllReviewed: ✓ mọi dòng chưa ✓ trừ dòng ghi chú; giữ nguyên dòng đã ✓ (kể cả giờ cũ)", () => {
  const rows = [
    full({ is_note: true, status: "note" }),
    full({ rid: "a" }),
    full({ rid: "b", reviewed: true, reviewed_at: 5 }),
    full({ rid: "c" }),
  ];
  const out = setAllReviewed(rows, 99);
  assert.equal(out[0], rows[0]);
  assert.equal(out[2], rows[2]);                                    // đã ✓ thì không đụng
  assert.deepEqual([out[1].reviewed, out[1].reviewed_at], [true, 99]);
  assert.deepEqual([out[3].reviewed, out[3].reviewed_at], [true, 99]);
  assert.equal("reviewed" in rows[1], false);                       // không đụng bản gốc
});

test("setAllReviewed: không còn dòng nào để ✓ thì trả CHÍNH mảng cũ", () => {
  const rows = [full({ is_note: true, status: "note" }), full({ reviewed: true, reviewed_at: 5 })];
  assert.equal(setAllReviewed(rows, 99), rows);
  assert.equal(setAllReviewed([], 99).length, 0);
});

test("xác nhận cả mặt: mọi dòng thành confirmed kể cả dòng NG và dòng 行抜け; số cần soát về 0", () => {
  const rows = [
    full({ balance: 1000 }),
    full({ amount_out: 100, balance: 999 }),
    full({ amount_out: 100, balance: 899, status: "check", reason: "行番号 3→5: 1行抜けの疑い" }),
  ];
  assert.equal(sheetStats([{ rows }]).need, 2);
  const out = setAllReviewed(rows, 1);
  assert.deepEqual(sheetStats([{ rows: out }]), { rows: 3, need: 0, fixed: 0, confirmed: 3, edited: 0 });
});

test("ngCount: chỉ đếm dòng chưa ✓ mà chuỗi số dư NG (ghi chú và dòng đã ✓ thì không)", () => {
  const rows = [
    full({ balance: 1000 }),
    full({ amount_out: 100, balance: 999 }),                        // NG
    full({ amount_out: 100, balance: 5, reviewed: true }),          // NG nhưng đã ✓
    full({ is_note: true, status: "note", balance: 77 }),
    full({ amount_out: 1, balance: 76 }),                           // OK (mốc là dòng ghi chú)
  ];
  assert.equal(ngCount(rows), 1);
  assert.equal(ngCount([]), 0);
});

test("blankRow: dòng người thêm có rid moi, added=true, mọi ô trống; xin rid thì dùng rid đó", () => {
  const a = blankRow("s1");
  const b = blankRow("s1");
  assert.match(a.rid ?? "", /^[0-9a-f]{12}$/);
  assert.notEqual(a.rid, b.rid);
  assert.deepEqual([a.added, a.sheet_id, a.date, a.balance, a.status, a.reason], [true, "s1", null, null, "ok", ""]);
  assert.equal(blankRow(null, "xyz").rid, "xyz");
  assert.equal(needsReview(a, "―"), true);                          // chưa ✓ ⇒ cần soát
});

test("insertRowAfter: chèn NGAY DƯỚI dòng chỉ định, các dòng khác giữ nguyên tham chiếu", () => {
  const rows = [full({ rid: "a" }), full({ rid: "b" }), full({ rid: "c" })];
  const moi = blankRow("s", "n");
  const out = insertRowAfter(rows, 1, moi);
  assert.deepEqual(out.map((r) => r.rid), ["a", "b", "n", "c"]);
  assert.equal(out[0], rows[0]);
  assert.equal(out[3], rows[2]);
  assert.equal(rows.length, 3);                                     // không đụng bản gốc
});

test("insertRowAfter: dòng cuối hoặc vượt cuối = thêm vào cuối; -1 = lên đầu; mảng rỗng chạy được", () => {
  const rows = [full({ rid: "a" }), full({ rid: "b" })];
  assert.deepEqual(insertRowAfter(rows, 1, blankRow("s", "n")).map((r) => r.rid), ["a", "b", "n"]);
  assert.deepEqual(insertRowAfter(rows, 99, blankRow("s", "n")).map((r) => r.rid), ["a", "b", "n"]);
  assert.deepEqual(insertRowAfter(rows, -1, blankRow("s", "n")).map((r) => r.rid), ["n", "a", "b"]);
  assert.deepEqual(insertRowAfter([], 0, blankRow("s", "n")).map((r) => r.rid), ["n"]);
});

test("restoreField: trả ô số về giá trị máy đọc và xoá khoá khỏi orig (hết orig thì bỏ hẳn)", () => {
  const sua = applyEdit([full({ balance: 1000, description: "A" })], 0, "balance", 1200);
  const sua2 = applyEdit(sua, 0, "description", "B");
  const r1 = restoreField(sua2, 0, "balance");
  assert.equal(r1[0].balance, 1000);
  assert.deepEqual(r1[0].orig, { description: "A" });
  const r2 = restoreField(r1, 0, "description");
  assert.equal(r2[0].description, "A");
  assert.equal("orig" in r2[0], false);
  assert.equal(rowState(r2[0], "―"), "ok");                         // hết dấu vết sửa tay
});

test("restoreField: ô ngày — máy đọc ISO thì ra ISO, máy không đọc được thì ra lại chữ gốc, máy để trống thì trống", () => {
  const iso = applyEdit([full({ date: "2025-04-11" })], 0, "date", "2025/4/12");
  assert.equal(restoreField(iso, 0, "date")[0].date, "2025-04-11");
  const hong = applyEdit([full({ date: null, date_raw: "07-0?-11" })], 0, "date", "2025-04-11");
  const lai = restoreField(hong, 0, "date")[0];
  assert.deepEqual([lai.date, lai.date_raw, "orig" in lai], [null, "07-0?-11", false]);
  const trong = applyEdit([full({ date: null, date_raw: null })], 0, "date", "2025-04-11");
  const lai2 = restoreField(trong, 0, "date")[0];
  assert.deepEqual([lai2.date, lai2.date_raw, "orig" in lai2], [null, null, false]);
});

test("restoreField: ô máy để trống (null) khôi phục về trống; ô chưa từng sửa thì trả CHÍNH mảng cũ", () => {
  const sua = applyEdit([full({ amount_in: null })], 0, "amount_in", 500);
  assert.equal(restoreField(sua, 0, "amount_in")[0].amount_in, null);
  const rows = [full({ balance: 5 })];
  assert.equal(restoreField(rows, 0, "balance"), rows);
  assert.equal(restoreField(rows, 9, "balance"), rows);
});

test("restoreField giữ nguyên ✓ và các ô khác của dòng", () => {
  const rows = setReviewed(applyEdit([full({ balance: 10, description: "x" })], 0, "balance", 20), 0, true, 7);
  const out = restoreField(rows, 0, "balance")[0];
  assert.deepEqual([out.balance, out.description, out.reviewed, out.reviewed_at], [10, "x", true, 7]);
});

test("editChanges: liệt kê máy đọc → hiện tại theo thứ tự cột; dòng chưa sửa thì rỗng", () => {
  let rows = [full({ date: "2025-04-11", description: "A", balance: 100 })];
  rows = applyEdit(rows, 0, "balance", 150);
  rows = applyEdit(rows, 0, "date", "2025/4/12");
  rows = applyEdit(rows, 0, "description", null);
  assert.deepEqual(editChanges(rows[0]), [
    { field: "date", from: "2025-04-11", to: "2025-04-12" },
    { field: "description", from: "A", to: null },
    { field: "balance", from: 100, to: 150 },
  ]);
  assert.deepEqual(editChanges(full({})), []);
});
