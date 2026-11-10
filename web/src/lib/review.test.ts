import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { SheetResult, Tx } from "./api.ts";
import {
  analyzeRows,
  applyDateEdit,
  applyEdit,
  applyFix,
  balanceBefore,
  blankRow,
  chainChecks,
  dupBadges,
  duplicatePairs,
  editChanges,
  explainOpen,
  explainReason,
  focusField,
  insertRowAfter,
  isAlarm,
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
  sheetLinks,
  sheetStats,
  shown,
  suggestFixes,
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


// ── Task 1.5: lý do dễ hiểu + gợi ý sửa một chạm ────────────────────

const kinds = (fixes: { kind: string }[]) => fixes.map((f) => f.kind);

test("explainReason: lý do cần soát được giải thích bằng ba thứ tiếng, số dòng nhảy được đệm 0", () => {
  const gap = parseReasons("行番号 6→8: 1行抜けの疑い")[0];
  assert.equal(explainReason(gap, "vi"), "Số dòng nhảy 06→08: có thể sót 1 dòng");
  assert.equal(explainReason(gap, "en"), "Row numbers jump 06→08: 1 row(s) may be missing");
  assert.match(explainReason(gap, "ja"), /06→08.*1行/);
  assert.equal(explainReason(parseReasons("日付不明")[0], "vi"), "Không đọc được ngày");
  assert.equal(explainReason(parseReasons("低信頼度")[0], "vi"), "Máy đọc không chắc (chữ mờ)");
  assert.equal(explainReason(parseReasons("残高が読取れず検証不可")[0], "en"), "Balance unreadable, so this row cannot be verified");
  assert.equal(explainReason(parseReasons("日付不明(手入力)")[0], "ja"), "日付を読み取れません");
});

test("explainReason: lý do số dư dùng mức lệch THẬT (in − tính), không dùng 差額 của engine", () => {
  const r = parseReasons("残高不一致(差額 +340)")[0];                 // 差額 = in − số dư dòng trước, không phải mức lệch
  assert.equal(explainReason(r, "vi", { diff: 440 }), "Số dư lệch +440 so với phép tính từ dòng trên");
  assert.equal(explainReason(r, "vi", { diff: -1234 }), "Số dư lệch -1,234 so với phép tính từ dòng trên");
  assert.equal(explainReason(r, "vi"), "Số dư không khớp phép tính từ dòng trên");   // chưa biết mức lệch thì không bịa
  assert.match(explainReason(r, "en", { diff: 440 }), /off by \+440/);
});

test("explainReason: ghi chú tự sửa của máy cũng được giải thích; chuỗi lạ giữ nguyên", () => {
  const ex = (s: string, lang: "vi" | "en" | "ja" = "vi") => explainReason(parseReasons(s)[0], lang);
  assert.equal(ex("金額を入金列へ移動"), "Máy đã chuyển số tiền sang cột 入金");
  assert.equal(ex("金額の列を入替"), "Máy đã đổi chỗ hai cột tiền");
  assert.equal(ex("残高を検算で補正(印字読取 906,810)"), "Máy đã sửa số dư theo phép tính (bản in đọc ra 906,810)");
  assert.equal(ex("残高を検算で補正"), "Máy đã sửa số dư theo phép tính");
  assert.equal(ex("日付は前行と同じ(印字なし)", "en"), "No date printed: using the date of the row above");
  assert.equal(ex("年を後行から補完", "ja"), "下の行から年を補いました");
  assert.equal(ex("何かの警告"), "何かの警告");
  assert.equal(ex("未知の補正"), "Máy đã tự sửa dòng này");
});

test("explainOpen: dòng NG máy không ghi lý do vẫn được giải thích; dòng thêm tay được nhắc; dòng không cần soát thì rỗng", () => {
  const rows = [full({ balance: 1000 }), full({ amount_out: 100, balance: 1340 }), full({ amount_out: 1, balance: 899 })];
  const info = analyzeRows(rows);
  assert.equal(info[1].diff, 440);
  assert.deepEqual(explainOpen(rows[1], info[1], "vi"), ["Số dư lệch +440 so với phép tính từ dòng trên"]);
  assert.deepEqual(explainOpen(rows[0], info[0], "vi"), []);
  const them = [full({ balance: 1000 }), full({ added: true, amount_out: 100, balance: 900 })];
  assert.deepEqual(explainOpen(them[1], analyzeRows(them)[1], "vi"), ["Dòng thêm tay — chưa soát"]);
  const date = [full({ date: null, date_raw: "?", status: "check", reason: "日付不明・低信頼度" })];
  assert.deepEqual(explainOpen(date[0], analyzeRows(date)[0], "vi"), ["Không đọc được ngày", "Máy đọc không chắc (chữ mờ)"]);
});

test("analyzeRows.diff: chỉ có ở dòng NG, bằng số dư in trừ số dư tính được", () => {
  const info = analyzeRows([full({ balance: 1000 }), full({ amount_in: 50, balance: 1000 }), full({ amount_out: 10, balance: 990 })]);
  assert.deepEqual(info.map((x) => x.diff), [null, -50, null]);
});

test("gợi ý 1: đổi cột 出金↔入金 khi đảo cột làm chuỗi khớp; không gợi ý khi đảo cũng không khớp", () => {
  // Thật ra rút 300 (700), máy đọc nhầm sang cột 入金
  const sai = [full({ balance: 1000 }), full({ amount_in: 300, balance: 700 })];
  assert.deepEqual(suggestFixes(sai, 1)[0], { kind: "swap" });
  assert.equal(kinds(suggestFixes(sai, 1)).includes("note"), false, "dòng kế không nối từ số dư trước thì không phải dòng thông báo");
  const khong = [full({ balance: 1000 }), full({ amount_in: 300, balance: 650 })];
  assert.equal(kinds(suggestFixes(khong, 1)).includes("swap"), false);
  const haiBen = [full({ balance: 1000 }), full({ amount_in: 300, amount_out: 300, balance: 5 })];
  assert.equal(kinds(suggestFixes(haiBen, 1)).includes("swap"), false);   // 出金 = 入金: đảo cột không đổi gì
});

test("gợi ý 2: sửa 残高 thành số tính được CHỈ khi số dư dòng kế khớp (bằng chứng hai phía)", () => {
  const ok = [full({ balance: 1000 }), full({ amount_out: 100, balance: 999 }), full({ amount_out: 50, balance: 850 })];
  assert.deepEqual(suggestFixes(ok, 1).find((f) => f.kind === "balance"), { kind: "balance", value: 900 });
  const lech = [ok[0], ok[1], full({ amount_out: 50, balance: 840 })];       // dòng kế không khớp với 900 ⇒ không đủ bằng chứng
  assert.equal(kinds(suggestFixes(lech, 1)).includes("balance"), false);
  assert.equal(kinds(suggestFixes(ok.slice(0, 2), 1)).includes("balance"), false);   // không có dòng nào phía sau để đối chiếu
  const nghi = [ok[0], ok[1], full({ amount_out: 50 }), full({ amount_out: 10, balance: 840 })];   // dòng không in 残高: cộng dồn
  assert.deepEqual(suggestFixes(nghi, 1).find((f) => f.kind === "balance"), { kind: "balance", value: 900 });
  const ghiChu = [ok[0], ok[1], full({ is_note: true, status: "note", balance: 900 })];       // 繰越 in lại đúng số dư
  assert.equal(kinds(suggestFixes(ghiChu, 1)).includes("balance"), true);
});

test("gợi ý 3: sửa số tiền khi chỉ khác 1–2 chữ số; không gợi ý khi khác xa hoặc không dương", () => {
  const out = [full({ balance: 22061 }), full({ amount_out: 1700, balance: 20961 })];   // thật ra 1,100
  assert.deepEqual(suggestFixes(out, 1).find((f) => f.kind === "amount"), { kind: "amount", field: "amount_out", value: 1100 });
  const inn = [full({ balance: 1000 }), full({ amount_in: 480, balance: 1450 })];       // thật ra 450
  assert.deepEqual(suggestFixes(inn, 1).find((f) => f.kind === "amount"), { kind: "amount", field: "amount_in", value: 450 });
  const xa = [full({ balance: 22061 }), full({ amount_out: 9876, balance: 20961 })];    // 9876 vs 1100: đọc nhầm cả số
  assert.equal(kinds(suggestFixes(xa, 1)).includes("amount"), false);
  const am = [full({ balance: 1000 }), full({ amount_out: 10, balance: 2000 })];         // cần 出金 = -1000
  assert.equal(kinds(suggestFixes(am, 1)).includes("amount"), false);
  const thieu = [full({ balance: 22061 }), full({ amount_out: 110, balance: 20961 })];   // thiếu một chữ số 0: 110 → 1100
  assert.deepEqual(suggestFixes(thieu, 1).find((f) => f.kind === "amount"), { kind: "amount", field: "amount_out", value: 1100 });
});

test("gợi ý 4: thêm dòng bị sót — rút khi số dư thấp hơn tính toán, gửi khi cao hơn; không ra số dư âm", () => {
  const rut = [full({ balance: 1000 }), full({ amount_out: 100, balance: 600 })];        // thấp hơn 300 ⇒ sót một lần rút 300
  assert.deepEqual(suggestFixes(rut, 1).find((f) => f.kind === "addrow"), { kind: "addrow", side: "out", amount: 300, balance: 700 });
  const gui = [full({ balance: 1000 }), full({ amount_out: 100, balance: 1500 })];       // cao hơn 600 ⇒ sót một lần gửi 600
  assert.deepEqual(suggestFixes(gui, 1).find((f) => f.kind === "addrow"), { kind: "addrow", side: "in", amount: 600, balance: 1600 });
  const am = [full({ balance: 100 }), full({ amount_out: 10, balance: -500 })];
  assert.equal(kinds(suggestFixes(am, 1)).includes("addrow"), false);
});

test("gợi ý: tối đa 3 phương án, đúng thứ tự 1 → 2 → 3 → 4", () => {
  const rows = [full({ balance: 1000 }), full({ amount_in: 300, balance: 700 }), full({ amount_out: 50, balance: 1250 })];
  // swap (1000-300=700), balance (E=1300, dòng kế 1250 khớp), addrow rút 600 (700-1300); amount không có (B-P<0)
  assert.deepEqual(kinds(suggestFixes(rows, 1)), ["swap", "balance", "addrow"]);
  assert.ok(suggestFixes(rows, 1).length <= 3);
});

test("gợi ý: chỉ cho dòng NG — dòng khớp, đã ✓, ghi chú, đầu khối, không có số dư thì không gợi ý gì", () => {
  const rows = [full({ balance: 1000 }), full({ amount_out: 100, balance: 900 }), full({ amount_out: 1, balance: 5, reviewed: true }),
    full({ is_note: true, status: "note", balance: 77 }), full({ amount_out: 1 })];
  for (const i of [0, 1, 2, 3, 4, 9]) assert.deepEqual(suggestFixes(rows, i), [], `dòng ${i}`);
});

test("applyFix: mỗi phương án làm dòng hết NG và ghi nhớ giá trị máy đọc (orig) như người tự gõ", () => {
  const needOf = (rows: Tx[]) => analyzeRows(rows).filter((x) => x.need).length;

  const sw = [full({ balance: 1000 }), full({ amount_in: 300, balance: 700 })];
  const swOut = applyFix(sw, 1, { kind: "swap" });
  assert.deepEqual([swOut[1].amount_out, swOut[1].amount_in], [300, null]);
  assert.deepEqual(swOut[1].orig, { amount_in: 300, amount_out: null });
  assert.equal(needOf(swOut), 0);

  const bl = [full({ balance: 1000 }), full({ amount_out: 100, balance: 999 }), full({ amount_out: 50, balance: 850 })];
  assert.equal(needOf(bl), 2);                                                  // dòng sai và dòng kế lệch theo
  const blOut = applyFix(bl, 1, { kind: "balance", value: 900 });
  assert.deepEqual(blOut[1].orig, { balance: 999 });
  assert.equal(needOf(blOut), 0);                                               // sửa một chỗ, hết cả hai

  const am = [full({ balance: 22061 }), full({ amount_out: 1700, balance: 20961 })];
  const amOut = applyFix(am, 1, { kind: "amount", field: "amount_out", value: 1100 });
  assert.equal(amOut[1].amount_out, 1100);
  assert.equal(needOf(amOut), 0);
});

test("applyFix addrow: chèn dòng sót NGAY TRÊN dòng NG, mượn ngày, balance đúng, vẫn phải ✓; dòng cũ hết NG", () => {
  const rows = [full({ balance: 1000 }), full({ amount_out: 100, balance: 600, date: "2025-05-02" })];
  const fix = suggestFixes(rows, 1).find((f) => f.kind === "addrow")!;
  const out = applyFix(rows, 1, fix);
  assert.equal(out.length, 3);
  const nova = out[1];
  assert.deepEqual([nova.added, nova.date, nova.amount_out, nova.amount_in, nova.balance, nova.description],
    [true, "2025-05-02", 300, null, 700, null]);
  assert.equal(out[2], rows[1]);                                                // dòng NG cũ giữ nguyên tham chiếu
  const info = analyzeRows(out);
  assert.deepEqual(info.map((x) => x.chk), ["―", "OK", "OK"]);                  // cả hai dòng đều khớp chuỗi
  assert.deepEqual(info.map((x) => x.need), [false, true, false]);              // chỉ dòng thêm tay còn cần ✓
});

test("gợi ý: dòng đang KHỚP chuỗi thì dù có thể 'sửa' cho khớp thêm vẫn không được gợi ý", () => {
  const rows = [full({ balance: 1000 }), full({ amount_out: 100, balance: 900 }), full({ amount_out: 50, balance: 850 })];
  assert.deepEqual(suggestFixes(rows, 1), []);                                  // dòng kế khớp với 900 nhưng dòng này đã đúng
});


// ── Task 1.6: kiểm chỗ nối số dư giữa các mặt sổ ─────────────────────

const meta = (account_no: string | null = "A1", bank_name: string | null = null) => ({
  bank_name, store_no: null, account_no, holder: null,
});
const result = (id: string, rows: Partial<Tx>[], m = meta(), extra: Partial<SheetResult> = {}): SheetResult => ({
  sheet_id: id, job_id: "j", scanned_at: 0, model: null, cached: null, cost_usd: null,
  blocks: [{ meta: m, rows: rows.map(full) }], ...extra,
});
const ids = (...names: string[]) => names.map((id) => ({ id }));

test("sheetLinks: hai mặt nối đúng — số dư cuối của A cộng trừ các dòng đầu của B ra đúng số dư in", () => {
  const store = {
    a: result("a", [{ balance: 1000 }, { amount_out: 100, balance: 900 }]),
    b: result("b", [{ amount_out: 50, balance: 850 }, { amount_in: 10, balance: 860 }]),
  };
  const [l] = sheetLinks(ids("a", "b"), store);
  assert.deepEqual([l.from, l.to, l.status, l.diff, l.via, l.sameBook, l.dismissed], ["a", "b", "ok", null, "chain", true, false]);
  assert.equal(isAlarm(l), false);
});

test("sheetLinks: đứt chuỗi — báo mức chênh = số dư in − số dư tính được; chỉ báo động khi chắc cùng sổ", () => {
  const store = {
    a: result("a", [{ balance: 1000 }]),
    b: result("b", [{ amount_out: 50, balance: 1000 }]),                          // phải là 950
  };
  const [l] = sheetLinks(ids("a", "b"), store);
  assert.deepEqual([l.status, l.diff, l.sameBook], ["break", 50, true]);
  assert.equal(isAlarm(l), true);
  const khongBiaTrang = { a: result("a", [{ balance: 1000 }], meta(null)), b: result("b", [{ amount_out: 50, balance: 1000 }], meta(null)) };
  const [w] = sheetLinks(ids("a", "b"), khongBiaTrang);
  assert.deepEqual([w.status, w.diff, w.sameBook], ["break", 50, false]);       // vẫn thấy, nhưng không phải báo động
  assert.equal(isAlarm(w), false);
});

test("sheetLinks: khác số tài khoản (hoặc khác ngân hàng) thì không kiểm", () => {
  const khacSo = { a: result("a", [{ balance: 1000 }], meta("A1")), b: result("b", [{ balance: 5 }], meta("B2")) };
  assert.equal(sheetLinks(ids("a", "b"), khacSo)[0].status, "different");
  const khacBank = { a: result("a", [{ balance: 1000 }], meta(null, "福岡銀行")), b: result("b", [{ balance: 5 }], meta(null, "西日本シティ銀行")) };
  assert.equal(sheetLinks(ids("a", "b"), khacBank)[0].status, "different");
  const motBenThieu = { a: result("a", [{ balance: 1000 }], meta(null, "福岡銀行")), b: result("b", [{ balance: 5 }], meta(null, null)) };
  assert.equal(sheetLinks(ids("a", "b"), motBenThieu)[0].status, "break");      // thiếu thông tin thì không loại trừ
});

test("sheetLinks: B mở đầu bằng 繰越 có số dư — bằng số dư cuối của A là nối chắc chắn, lệch là đứt", () => {
  const a = result("a", [{ balance: 1000 }, { amount_out: 100, balance: 900 }]);
  const ok = sheetLinks(ids("a", "b"), { a, b: result("b", [{ is_note: true, status: "note", balance: 900 }, { amount_out: 1, balance: 899 }]) })[0];
  assert.deepEqual([ok.status, ok.via], ["ok", "carry"]);
  const lech = sheetLinks(ids("a", "b"), { a, b: result("b", [{ is_note: true, status: "note", balance: 950 }]) })[0];
  assert.deepEqual([lech.status, lech.diff, lech.via], ["break", 50, null]);
  // 繰越 không in số dư thì bỏ qua và đi tiếp tới dòng có số dư
  const khongSo = sheetLinks(ids("a", "b"), { a, b: result("b", [{ is_note: true, status: "note" }, { amount_out: 1, balance: 899 }]) })[0];
  assert.deepEqual([khongSo.status, khongSo.via], ["ok", "chain"]);
});

test("sheetLinks: không có số dư ở A hoặc ở B thì 'không kiểm được' chứ không bịa", () => {
  const khongA = { a: result("a", [{ amount_out: 1 }]), b: result("b", [{ balance: 5 }]) };
  assert.equal(sheetLinks(ids("a", "b"), khongA)[0].status, "unknown");
  const khongB = { a: result("a", [{ balance: 1000 }]), b: result("b", [{ amount_out: 1 }, { amount_in: 2 }]) };
  assert.equal(sheetLinks(ids("a", "b"), khongB)[0].status, "unknown");
});

test("sheetLinks: dòng không in số dư ở cuối A và ở đầu B vẫn được cộng dồn", () => {
  const store = {
    a: result("a", [{ balance: 1000 }, { amount_out: 100, balance: 900 }, { amount_out: 20 }]),     // cuối A = 880
    b: result("b", [{ amount_out: 30 }, { amount_in: 5, balance: 855 }]),                          // 880 - 30 + 5
  };
  assert.equal(sheetLinks(ids("a", "b"), store)[0].status, "ok");
});

test("sheetLinks: chỉ xét cặp LIỀN NHAU trong danh sách mà cả hai đã có kết quả", () => {
  const store = {
    a: result("a", [{ balance: 1000 }]),
    c: result("c", [{ amount_out: 100, balance: 900 }]),
    d: result("d", [{ balance: 900 }]),
  };
  // b chưa quét: a–b và b–c bỏ qua, a–c KHÔNG được tính vì không liền nhau
  const links = sheetLinks(ids("a", "b", "c", "d"), store);
  assert.deepEqual(links.map((l) => [l.from, l.to, l.status]), [["c", "d", "ok"]]);
  assert.deepEqual(sheetLinks(ids("a"), store), []);
  assert.deepEqual(sheetLinks([], {}), []);
});

test("sheetLinks: mặt có nhiều sổ — lấy khối CUỐI của A và khối ĐẦU của B", () => {
  const a: SheetResult = { ...result("a", [{ balance: 77 }], meta("X")), blocks: [
    { meta: meta("X"), rows: [full({ balance: 77 })] },
    { meta: meta("A1"), rows: [full({ balance: 1000 })] },
  ] };
  const b: SheetResult = { ...result("b", [{ amount_out: 100, balance: 900 }], meta("A1")), blocks: [
    { meta: meta("A1"), rows: [full({ amount_out: 100, balance: 900 })] },
    { meta: meta("Z"), rows: [full({ balance: 5 })] },
  ] };
  const [l] = sheetLinks(ids("a", "b"), { a, b });
  assert.deepEqual([l.status, l.sameBook], ["ok", true]);
});

test("sheetLinks: 'Không phải lỗi' chỉ có hiệu lực với ĐÚNG mặt trước và ĐÚNG mức chênh", () => {
  const a = result("a", [{ balance: 1000 }]);
  const b = (link_ok: { prev: string; diff: number } | null) =>
    result("b", [{ amount_out: 50, balance: 1000 }], meta(), { link_ok });
  assert.equal(sheetLinks(ids("a", "b"), { a, b: b({ prev: "a", diff: 50 }) })[0].dismissed, true);
  assert.equal(isAlarm(sheetLinks(ids("a", "b"), { a, b: b({ prev: "a", diff: 50 }) })[0]), false);
  assert.equal(sheetLinks(ids("a", "b"), { a, b: b({ prev: "z", diff: 50 }) })[0].dismissed, false);   // đổi mặt trước
  assert.equal(sheetLinks(ids("a", "b"), { a, b: b({ prev: "a", diff: 49 }) })[0].dismissed, false);    // chỗ đứt đã khác
  assert.equal(sheetLinks(ids("a", "b"), { a, b: b(null) })[0].dismissed, false);
  // đổi thứ tự: mặt đứng trước B là mặt khác ⇒ xác nhận cũ hết hiệu lực
  const c = result("c", [{ balance: 400 }]);
  assert.equal(sheetLinks(ids("c", "b"), { c, b: b({ prev: "a", diff: 50 }) })[0].dismissed, false);
});


// ── Task 1.7: hai ảnh chụp cùng một trang ────────────────────────────

/** Mặt sổ có các số dư cho trước (mỗi số một dòng, chỉ để có dữ liệu). */
const withBalances = (id: string, balances: number[], extra: Partial<Tx>[] = []) =>
  result(id, [...balances.map((balance) => ({ balance })), ...extra]);
const BAL = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000];

test("duplicatePairs: chụp lại cùng một trang (cùng số dư) là nghi trùng, kèm số liệu để hiện 'x/y số dư trùng'", () => {
  const store = { a: withBalances("a", BAL), b: withBalances("b", BAL.slice(0, 6)) };
  assert.deepEqual(duplicatePairs(ids("a", "b"), store), [{ a: "a", b: "b", common: 6, sizeA: 8, sizeB: 6 }]);
});

test("duplicatePairs: ngưỡng — đúng 4 số dư và đúng 50% thì trùng; 3 số dư hoặc dưới 50% thì không", () => {
  const dung = { a: withBalances("a", [10000, 20000, 30000, 40000, 51000, 52000, 53000, 54000]), b: withBalances("b", [10000, 20000, 30000, 40000, 61000, 62000, 63000, 64000]) };
  assert.equal(duplicatePairs(ids("a", "b"), dung).length, 1);                     // 4 chung / min(8, 8) = 50%
  const ba = { a: withBalances("a", [10000, 20000, 30000, 51000]), b: withBalances("b", [10000, 20000, 30000, 61000]) };
  assert.equal(duplicatePairs(ids("a", "b"), ba).length, 0);                       // chỉ 3 chung (75% nhưng chưa đủ 4)
  const thua = { a: withBalances("a", [10000, 20000, 30000, 40000, 51000, 52000, 53000, 54000, 55000]), b: withBalances("b", [10000, 20000, 30000, 40000, 61000, 62000, 63000, 64000, 65000]) };
  assert.equal(duplicatePairs(ids("a", "b"), thua).length, 0);                     // 4/9 < 50%
});

test("duplicatePairs: số dư nhỏ (< 1,000) và dòng ghi chú không được tính; số dư lặp trong một mặt chỉ tính một lần", () => {
  const nho = { a: withBalances("a", [100, 200, 300, 400, 500, 600]), b: withBalances("b", [100, 200, 300, 400, 500, 600]) };
  assert.deepEqual(duplicatePairs(ids("a", "b"), nho), []);
  const ghiChu = {
    a: withBalances("a", [10000, 20000, 30000], [{ is_note: true, status: "note", balance: 40000 }]),
    b: withBalances("b", [10000, 20000, 30000], [{ is_note: true, status: "note", balance: 40000 }]),
  };
  assert.deepEqual(duplicatePairs(ids("a", "b"), ghiChu), []);                     // 繰越 lặp giữa hai trang liền nhau là chuyện thường
  const lap = { a: withBalances("a", [10000, 10000, 10000, 10000, 10000]), b: withBalances("b", [10000, 10000, 10000, 10000, 10000]) };
  assert.deepEqual(duplicatePairs(ids("a", "b"), lap), []);
});

test("duplicatePairs: hai trang LIỀN NHAU của cùng một sổ không bị báo trùng (chỉ chung số dư biên)", () => {
  const store = {
    a: withBalances("a", [10000, 20000, 30000, 40000, 50000]),
    b: withBalances("b", [50000, 60000, 70000, 80000, 90000]),
  };
  assert.deepEqual(duplicatePairs(ids("a", "b"), store), []);
});

test("duplicatePairs: 'Không phải trùng' loại cặp đó, đúng cả khi ghi ngược thứ tự; cặp khác vẫn còn", () => {
  const store = { a: withBalances("a", BAL), b: withBalances("b", BAL), c: withBalances("c", BAL) };
  const all = duplicatePairs(ids("a", "b", "c"), store);
  assert.deepEqual(all.map((p) => [p.a, p.b]), [["a", "b"], ["a", "c"], ["b", "c"]]);
  assert.deepEqual(duplicatePairs(ids("a", "b", "c"), store, [["b", "a"]]).map((p) => [p.a, p.b]), [["a", "c"], ["b", "c"]]);
  assert.deepEqual(duplicatePairs(ids("a", "b", "c"), store, [["a", "b"], ["c", "a"], ["b", "c"]]), []);
});

test("duplicatePairs: mặt chưa có kết quả hoặc không có số dư bị bỏ qua; mặt đứng trước luôn là `a`", () => {
  const store = { a: withBalances("a", BAL), c: withBalances("c", BAL) };
  assert.deepEqual(duplicatePairs(ids("c", "x", "a"), store).map((p) => [p.a, p.b]), [["c", "a"]]);
  assert.deepEqual(duplicatePairs([], {}), []);
  assert.deepEqual(duplicatePairs(ids("a"), store), []);
});

test("dupBadges: mỗi mặt nghi là bản chụp lại chỉ gắn với mặt đứng trước SỚM NHẤT nghi trùng nó", () => {
  const store = { a: withBalances("a", BAL), b: withBalances("b", BAL), c: withBalances("c", BAL), d: withBalances("d", [1000, 2000]) };
  const pairs = duplicatePairs(ids("a", "b", "c", "d"), store);
  const badge = dupBadges(pairs);
  assert.deepEqual(Object.keys(badge).sort(), ["b", "c"]);                         // a đứng đầu nên không có huy hiệu
  assert.equal(badge.b.a, "a");
  assert.equal(badge.c.a, "a");                                                     // (b,c) cũng trùng nhưng a đứng trước b
  // bảo (a,c) không phải trùng thì c quay sang trùng với b
  const sau = dupBadges(duplicatePairs(ids("a", "b", "c", "d"), store, [["a", "c"]]));
  assert.equal(sau.c.a, "b");
});


test("balanceBefore: số dư kỳ vọng ngay trước từng dòng — null ở dòng đầu, cộng dồn qua dòng không in số dư, lấy mốc từ dòng ghi chú", () => {
  const rows = [
    full({ is_note: true, status: "note", balance: 1000 }),
    full({ amount_out: 100, balance: 900 }),
    full({ amount_out: 50 }),                       // không in số dư
    full({ amount_in: 10, balance: 860 }),
  ];
  assert.deepEqual(balanceBefore(rows), [null, 1000, 900, 850]);
  assert.deepEqual(balanceBefore([full({ balance: 5 })]), [null]);
  assert.deepEqual(balanceBefore([]), []);
});

// ── Dòng thông báo (vd của máy ATM) bị đọc thành giao dịch ──────────────

/** Như sổ mẫu: dòng 2 là thông báo «nhập ¥60,000, còn ¥60,059» in xen vào; dòng 3 nối thẳng từ dòng 1. */
const atmRows = (): Tx[] => [
  { ...tx(), balance: 103609, amount_in: 100 },
  { ...tx(), description: "オトリヒキ（ニュウキン", amount_in: 60000, balance: 60059, status: "check" },
  { ...tx(), amount_out: 60000, balance: 43609 },
];

test("suggestFixes: bỏ qua dòng mà chuỗi nối tiếp thì «coi là dòng ghi chú» đứng ĐẦU, trước gợi ý thêm dòng sót", () => {
  const f = suggestFixes(atmRows(), 1);
  assert.equal(f[0].kind, "note");
  assert.ok(f.length <= 3);
});

test("suggestFixes: dòng kế không nối được từ số dư trước thì không gợi ý dòng ghi chú", () => {
  const rows = atmRows();
  rows[2] = { ...rows[2], balance: 43000 };
  assert.equal(suggestFixes(rows, 1).some((x) => x.kind === "note"), false);
});

test("suggestFixes: không có dòng phía sau để đối chứng thì không gợi ý dòng ghi chú", () => {
  assert.equal(suggestFixes(atmRows().slice(0, 2), 1).some((x) => x.kind === "note"), false);
});

test("applyFix note: dòng thành ghi chú, xoá số, giữ chữ; CẢ dòng đó lẫn dòng kế hết cần soát", () => {
  const before = atmRows();
  assert.deepEqual(analyzeRows(before).map((r) => r.need), [false, true, true]);
  const after = applyFix(before, 1, { kind: "note" });
  const r = after[1];
  assert.equal(r.is_note, true);
  assert.deepEqual([r.amount_out, r.amount_in, r.balance], [null, null, null]);
  assert.equal(r.description, "オトリヒキ（ニュウキン");
  assert.deepEqual(analyzeRows(after).map((x) => x.need), [false, false, false]);
  assert.equal(analyzeRows(after)[2].chk, "OK", "dòng kế nối thẳng từ dòng trước dòng ghi chú");
});

test("applyFix note: không còn số dư làm mốc, vẫn nhớ số máy đọc, không đụng mảng cũ", () => {
  const before = atmRows();
  const after = applyFix(before, 1, { kind: "note" });
  assert.deepEqual(after[1].orig, { amount_in: 60000, balance: 60059 });
  assert.equal(before[1].is_note, undefined, "Ctrl+Z trả về mảng cũ nên mảng cũ phải còn nguyên");
  assert.equal(before[1].balance, 60059);
  assert.equal(after.length, before.length);
});
