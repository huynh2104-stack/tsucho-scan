import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResultStore, Tx } from "./api.ts";
import { flattenRows, pendingOf, progress, resolveCurrent, rowKey, stepFrom, type QRow } from "./quickreview.ts";

const row = (over: Partial<Tx> = {}): Tx => ({
  date: "2025-04-25", date_raw: null, kind: null, description: "x", extra_text: null, store_code: null,
  amount_out: null, amount_in: null, balance: null, status: "ok", sheet_id: null, ...over,
} as Tx);

/** Một mặt sổ có các dòng khớp chuỗi số dư, rồi `bad` dòng in sai số dư (⇒ «cần soát»). Dòng có rid `${id}-${i}`. */
function sheet(id: string, good = 3, bad = 0): ResultStore[string] {
  const rows: Tx[] = [row({ balance: 100_000, rid: `${id}-0` })];
  let bal = 100_000;
  for (let i = 1; i <= good; i++) {
    bal -= 1000;
    rows.push(row({ amount_out: 1000, balance: bal, rid: `${id}-${i}` }));
  }
  for (let j = 0; j < bad; j++) rows.push(row({ amount_out: 1000, balance: bal + 777 + j * 5, rid: `${id}-bad${j}` }));
  return { sheet_id: id, job_id: "j", scanned_at: 0, model: null, cached: null, cost_usd: null,
    blocks: [{ meta: { bank_name: "A", store_no: null, account_no: "1", holder: null }, rows }] };
}
const ORDER = ["s1", "s2", "s3"];
const keys = (rows: QRow[]) => rows.map((r) => r.key);

test("flattenRows: theo thứ tự cột trái → khối → dòng, bỏ mặt không có kết quả / không nằm trong danh sách", () => {
  const store = { s2: sheet("s2", 1), s1: sheet("s1", 1), lac: sheet("lac", 1) };
  const flat = flattenRows(["s1", "chua-quet", "s2"], store);
  assert.deepEqual(keys(flat), ["s1-0", "s1-1", "s2-0", "s2-1"]);
  assert.deepEqual(flat.map((r) => r.ref.sheet), ["s1", "s1", "s2", "s2"]);
});

test("flattenRows/pendingOf: «cần soát» đúng định nghĩa chung (chỉ dòng in sai số dư), kèm ô gây lệch", () => {
  const store = { s1: sheet("s1", 2, 1), s2: sheet("s2", 3, 0) };
  const flat = flattenRows(ORDER, store);
  const pend = pendingOf(flat);
  assert.deepEqual(keys(pend), ["s1-bad0"]);
  assert.equal(pend[0].field, "balance");
  assert.deepEqual(pend[0].ref, { sheet: "s1", block: 0, row: 3 });
});

test("rowKey: dùng rid; dữ liệu cũ chưa có rid thì dùng vị trí", () => {
  assert.equal(rowKey(row({ rid: "abc" }), { sheet: "s", block: 0, row: 2 }), "abc");
  assert.equal(rowKey(row(), { sheet: "s", block: 1, row: 4 }), "s:1:4");
});

function flatOf(spec: Record<string, [number, number]>): QRow[] {
  const store: ResultStore = {};
  for (const [id, [good, bad]] of Object.entries(spec)) store[id] = sheet(id, good, bad);
  return flattenRows(Object.keys(spec), store);
}

test("resolveCurrent: dòng hiện tại còn cần soát thì ở lại; chưa chọn thì lấy dòng cần soát đầu tiên", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });                       // cần soát: s1-bad0, s2-bad0, s2-bad1
  assert.equal(resolveCurrent(rows, null, 0).row?.key, "s1-bad0");
  assert.equal(resolveCurrent(rows, "s2-bad0", 0).row?.key, "s2-bad0");
});

test("resolveCurrent: dòng vừa hết cần soát thì sang dòng cần soát KẾ TIẾP (kể cả ở mặt sổ sau), không quay về dòng trước", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });
  const xong = rows.map((r) => (r.key === "s1-bad0" ? { ...r, need: false } : r));
  assert.equal(resolveCurrent(xong, "s1-bad0", 3).row?.key, "s2-bad0");
});

test("resolveCurrent: có dòng cần soát NẰM TRƯỚC dòng vừa xong thì vẫn sang dòng kế tiếp phía sau, không lùi về dòng trước", () => {
  const rows = flatOf({ s1: [2, 2], s2: [1, 1] });                       // cần soát: s1-bad0, s1-bad1, s2-bad0
  const xong = rows.map((r) => (r.key === "s1-bad1" ? { ...r, need: false } : r));
  assert.equal(resolveCurrent(xong, "s1-bad1", 4).row?.key, "s2-bad0");
});

test("resolveCurrent: dòng hiện tại bị xoá mà phía trước còn dòng cần soát → vẫn lấy dòng cần soát từ vị trí cũ trở đi", () => {
  const rows = flatOf({ s1: [2, 2], s2: [1, 1] });
  const idx = rows.findIndex((r) => r.key === "s1-bad1");
  const daXoa = rows.filter((r) => r.key !== "s1-bad1");
  assert.equal(resolveCurrent(daXoa, "s1-bad1", idx).row?.key, "s2-bad0");
});

test("resolveCurrent: hết phía sau thì quay về dòng cần soát đầu tiên; không còn dòng nào thì null", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });
  const conCuoiXong = rows.map((r) => (r.key === "s2-bad1" ? { ...r, need: false } : r));
  assert.equal(resolveCurrent(conCuoiXong, "s2-bad1", 7).row?.key, "s1-bad0");
  const tatCa = rows.map((r) => ({ ...r, need: false }));
  assert.deepEqual(resolveCurrent(tatCa, "s2-bad1", 7), { row: null, idx: -1 });
});

test("resolveCurrent: dòng hiện tại đã bị xoá → dòng cần soát nằm từ vị trí cũ trở đi (dòng sau nó dồn lên)", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });
  const daXoa = rows.filter((r) => r.key !== "s1-bad0");                  // s1-bad0 ở vị trí 3
  assert.equal(resolveCurrent(daXoa, "s1-bad0", 3).row?.key, "s2-bad0");
});

test("stepFrom: sang dòng cần soát liền sau / liền trước, quay vòng; chỉ có một dòng thì không có dòng khác", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });
  const i = rows.findIndex((r) => r.key === "s2-bad0");
  assert.equal(stepFrom(rows, i, 1)?.key, "s2-bad1");
  assert.equal(stepFrom(rows, i, -1)?.key, "s1-bad0");
  assert.equal(stepFrom(rows, rows.findIndex((r) => r.key === "s2-bad1"), 1)?.key, "s1-bad0", "quay vòng về đầu");
  assert.equal(stepFrom(rows, 0, -1)?.key, "s2-bad1", "quay vòng về cuối");
  const mot = flatOf({ s1: [2, 1], s2: [1, 0] });
  assert.equal(stepFrom(mot, mot.findIndex((r) => r.key === "s1-bad0"), 1), null);
});

test("progress: «Dòng k/N» — N không co lại khi dòng được xử lý, k tăng dần", () => {
  const rows = flatOf({ s1: [2, 2], s2: [1, 1] });                       // 3 dòng cần soát
  const seen = new Set(pendingOf(rows).map((r) => r.key));
  assert.deepEqual(progress(seen, pendingOf(rows), "s1-bad0"), { k: 1, n: 3 });
  assert.deepEqual(progress(seen, pendingOf(rows), "s2-bad0"), { k: 3, n: 3 });
  const sau = rows.map((r) => (r.key === "s1-bad0" ? { ...r, need: false } : r));
  assert.deepEqual(progress(seen, pendingOf(sau), "s1-bad1"), { k: 2, n: 3 });          // xong 1 dòng, đang ở dòng thứ 2
  const gan = sau.map((r) => (r.key === "s1-bad1" ? { ...r, need: false } : r));
  assert.deepEqual(progress(seen, pendingOf(gan), "s2-bad0"), { k: 3, n: 3 });
});

test("progress: dòng mới phát sinh giữa phiên (sửa lệch số dư dòng khác) làm N tăng, không làm k lùi", () => {
  const rows = flatOf({ s1: [2, 1] });
  const seen = new Set(pendingOf(rows).map((r) => r.key));
  const them = flatOf({ s1: [2, 2] });                                    // xuất hiện thêm s1-bad1
  for (const r of pendingOf(them)) seen.add(r.key);
  assert.deepEqual(progress(seen, pendingOf(them), "s1-bad0"), { k: 1, n: 2 });
});
