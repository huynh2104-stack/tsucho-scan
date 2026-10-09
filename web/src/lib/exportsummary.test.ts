import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResultStore, Tx } from "./api.ts";
import { exportSummary, hasIssues, scopeIds } from "./exportsummary.ts";
import type { DupPair, SheetLink } from "./review.ts";

const row = (over: Partial<Tx> = {}): Tx => ({
  date: "2025-04-25", date_raw: null, kind: null, description: "x", extra_text: null, store_code: null,
  amount_out: null, amount_in: null, balance: null, status: "ok", sheet_id: null, ...over,
} as Tx);

/** Một mặt sổ: `bad` dòng lệch chuỗi số dư (⇒ «cần soát»), phần còn lại khớp. */
function sheet(id: string, bad = 0): ResultStore[string] {
  const rows: Tx[] = [row({ balance: 100_000 })];
  let bal = 100_000;
  for (let i = 0; i < 3; i++) {
    bal -= 1000;
    rows.push(row({ amount_out: 1000, balance: bal }));
  }
  for (let i = 0; i < bad; i++) rows.push(row({ amount_out: 1000, balance: bal + 777 }));   // số dư in sai
  return { sheet_id: id, job_id: "j", scanned_at: 0, model: null, cached: null, cost_usd: null,
    blocks: [{ meta: { bank_name: "A", store_no: null, account_no: "1", holder: null }, rows }] };
}

const link = (from: string, to: string, over: Partial<SheetLink> = {}): SheetLink => ({
  from, to, status: "break", diff: 50, via: "chain", sameBook: true, dismissed: false, ...over,
});
const dup = (a: string, b: string): DupPair => ({ a, b, common: 6, sizeA: 8, sizeB: 8 });
const SHEETS = ["s1", "s2", "s3", "s4"].map((id) => ({ id }));
const STORE: ResultStore = { s1: sheet("s1"), s2: sheet("s2", 1), s3: sheet("s3", 2), s4: sheet("s4") };
const ALL = scopeIds("all", STORE, null, new Set());

test("scopeIds: all = mọi mặt đã có kết quả; ticked = giao với ô tick; current = mặt đang xem (nếu có kết quả)", () => {
  const store = { s1: sheet("s1"), s2: sheet("s2") };
  assert.deepEqual([...scopeIds("all", store, null, new Set())].sort(), ["s1", "s2"]);
  assert.deepEqual([...scopeIds("ticked", store, null, new Set(["s2", "chua-quet"]))], ["s2"], "mặt chưa quét không có trong file");
  assert.deepEqual([...scopeIds("current", store, "s1", new Set())], ["s1"]);
  assert.deepEqual([...scopeIds("current", store, "chua-quet", new Set())], []);
  assert.deepEqual([...scopeIds("current", store, null, new Set())], []);
});

test("exportSummary: đếm dòng cần soát đúng bằng sheetStats và nhớ mặt sổ đầu tiên còn việc", () => {
  const s = exportSummary(SHEETS, STORE, ALL, [], []);
  assert.equal(s.need, 3);
  assert.equal(s.firstNeed, "s2");
  assert.equal(hasIssues(s), true);
});

test("exportSummary: sạch hoàn toàn thì không có gì và hasIssues = false", () => {
  const s = exportSummary(SHEETS, { s1: sheet("s1"), s4: sheet("s4") }, ALL, [], []);
  assert.deepEqual([s.need, s.breaks, s.dups, s.firstNeed, s.firstBreak, s.firstDup], [0, 0, 0, null, null, null]);
  assert.equal(hasIssues(s), false);
});

test("exportSummary: phạm vi — chỉ cộng các mặt trong phạm vi, firstNeed cũng theo phạm vi", () => {
  const chiS3 = exportSummary(SHEETS, STORE, new Set(["s3", "s4"]), [], []);
  assert.deepEqual([chiS3.need, chiS3.firstNeed], [2, "s3"]);
  const chiS1 = exportSummary(SHEETS, STORE, new Set(["s1"]), [], []);
  assert.deepEqual([chiS1.need, chiS1.firstNeed], [0, null]);
});

test("exportSummary: chỉ báo động mới tính là chỗ đứt (đã bấm «Không phải lỗi», khác sổ, không chắc cùng sổ → không tính)", () => {
  const links = [
    link("s1", "s2"),                                  // báo động
    link("s2", "s3", { dismissed: true }),             // đã xác nhận
    link("s3", "s4", { sameBook: false }),             // không chắc cùng sổ
    link("s1", "s3", { status: "ok", diff: null }),    // nối liền
    link("s2", "s4", { status: "different", diff: null }),
  ];
  const s = exportSummary(SHEETS, STORE, ALL, links, []);
  assert.equal(s.breaks, 1);
  assert.equal(s.firstBreak?.to, "s2");
});

test("exportSummary: chỗ đứt / cặp trùng chỉ tính khi CẢ HAI mặt nằm trong phạm vi", () => {
  const links = [link("s1", "s2"), link("s3", "s4")];
  const dups = [dup("s1", "s3"), dup("s2", "s4")];
  assert.deepEqual(
    (({ breaks, dups: d }) => [breaks, d])(exportSummary(SHEETS, STORE, ALL, links, dups)),
    [2, 2],
  );
  const s = exportSummary(SHEETS, STORE, new Set(["s1", "s2", "s3"]), links, dups);
  assert.deepEqual([s.breaks, s.dups, s.firstBreak?.to, s.firstDup?.b], [1, 1, "s2", "s3"]);
  assert.deepEqual(
    (({ breaks, dups: d }) => [breaks, d])(exportSummary(SHEETS, STORE, new Set(["s1"]), links, dups)),
    [0, 0],
  );
  // mặt TRƯỚC nằm ngoài phạm vi (chỉ mặt sau trong phạm vi): chỗ nối s1→s2 không tính, s3→s4 vẫn tính
  const sauThoi = exportSummary(SHEETS, STORE, new Set(["s2", "s3", "s4"]), links, dups);
  assert.deepEqual([sauThoi.breaks, sauThoi.firstBreak?.to, sauThoi.dups, sauThoi.firstDup?.b], [1, "s4", 1, "s4"]);
});

test("exportSummary: không đổi dữ liệu đầu vào và mặt chưa có kết quả bị bỏ qua", () => {
  const before = JSON.stringify(STORE);
  exportSummary([...SHEETS, { id: "chua-quet" }], STORE, new Set([...ALL, "chua-quet"]), [], []);
  assert.equal(JSON.stringify(STORE), before);
});
