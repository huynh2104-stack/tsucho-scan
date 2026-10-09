import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResultStore, RowBands, Tx } from "./api.ts";
import { calcOf, chainBreaks, flattenRows, pendingOf, progress, resolveCurrent, rowKey, sheetRowIndex, stepFrom, stripRect, stripSegments, STRIP_COL_PX, type QRow } from "./quickreview.ts";

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

test("resolveCurrent: chưa có dòng hiện tại (mới vào, hoặc vừa xong hết rồi Ctrl+Z) thì bắt đầu từ dòng cần soát ĐẦU TIÊN, bất kể vị trí cũ", () => {
  const rows = flatOf({ s1: [2, 1], s2: [1, 2] });
  assert.equal(resolveCurrent(rows, null, 7).row?.key, "s1-bad0");
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

// ── Dải ảnh của dòng & phép tính ──────────────────────────────────────

const bandsOf = (n: number, over: Partial<RowBands> = {}): RowBands => ({
  bands: Array.from({ length: n }, (_, i) => ({ y0: 0.1 + i * 0.1, y1: 0.2 + i * 0.1, method: "estimated" as const })),
  exact: false, skew_deg: 0, x0: 0.1, x1: 0.9, ...over,
});

test("sheetRowIndex: thứ tự dòng qua mọi khối của mặt sổ; mặt/khối không có → -1", () => {
  const store: ResultStore = { s: { ...sheet("s", 2), blocks: [
    { meta: { bank_name: null, store_no: null, account_no: null, holder: null }, rows: [row(), row(), row()] },
    { meta: { bank_name: null, store_no: null, account_no: null, holder: null }, rows: [row(), row()] },
  ] } };
  assert.equal(sheetRowIndex(store, { sheet: "s", block: 0, row: 2 }), 2);
  assert.equal(sheetRowIndex(store, { sheet: "s", block: 1, row: 1 }), 4);
  assert.equal(sheetRowIndex(store, { sheet: "khong-co", block: 0, row: 0 }), -1);
  assert.equal(sheetRowIndex(store, { sheet: "s", block: 5, row: 0 }), -1);
});

test("stripRect: nới một dòng mỗi phía bằng dải hàng xóm; bề ngang theo tờ giấy; giữ nguyên dải của chính dòng", () => {
  const r = stripRect(bandsOf(5), 2)!;
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  assert.deepEqual([r.cy0, r.cy1, r.y0, r.y1, r.cx0, r.cx1].map(r2), [0.2, 0.5, 0.3, 0.4, 0.1, 0.9], "dòng 2: hàng xóm 0.2–0.3 và 0.4–0.5");
  assert.equal(r.exact, false);
});

test("stripRect: hàng xóm cao thấp khác nhau thì lấy ĐÚNG mép của hàng xóm (không chỉ nới bằng chiều cao dòng)", () => {
  const b = bandsOf(3, { bands: [{ y0: 0.05, y1: 0.2 }, { y0: 0.2, y1: 0.3 }, { y0: 0.3, y1: 0.5 }] });
  const r = stripRect(b, 1)!;
  assert.deepEqual([r.cy0, r.cy1], [0.05, 0.5]);
});

test("stripRect: dòng đầu/cuối không có hàng xóm thì nới bằng đúng chiều cao dòng và không tràn ra ngoài ảnh", () => {
  const dau = stripRect(bandsOf(3, { bands: [{ y0: 0.02, y1: 0.12 }, { y0: 0.12, y1: 0.22 }, { y0: 0.9, y1: 0.99 }] }), 0)!;
  assert.equal(dau.cy0, 0, "0.02 − 0.10 < 0 → kẹp về 0");
  const cuoi = stripRect(bandsOf(3, { bands: [{ y0: 0.02, y1: 0.12 }, { y0: 0.12, y1: 0.22 }, { y0: 0.9, y1: 0.99 }] }), 2)!;
  assert.equal(cuoi.cy1, 1, "0.99 + 0.09 > 1 → kẹp về 1");
});

test("stripRect: nét liền khi dải khớp theo nội dung, mang theo độ nghiêng; dải hỏng / ngoài phạm vi → null", () => {
  const b = bandsOf(3, { skew_deg: 1.5, bands: [{ y0: 0.1, y1: 0.2, method: "content" }, { y0: 0.2, y1: 0.3, method: "content" }, { y0: 0.3, y1: 0.4 }] });
  const r = stripRect(b, 1)!;
  assert.deepEqual([r.exact, r.skew], [true, 1.5]);
  assert.equal(stripRect(b, 9), null);
  assert.equal(stripRect(b, -1), null);
  assert.equal(stripRect(null, 0), null);
  assert.equal(stripRect(bandsOf(2, { bands: [{ y0: 0.3, y1: 0.3 }, { y0: 0.4, y1: 0.5 }] }), 0), null, "dải rỗng");
  assert.equal(stripRect(bandsOf(2, { x0: 0.6, x1: 0.5 }), 0), null, "bề ngang không hợp lệ");
});

test("calcOf: số dư trước − rút + gửi = kỳ vọng, chênh = in − kỳ vọng; ghi chú / chưa có mốc → null", () => {
  const c = calcOf(row({ amount_out: 100, amount_in: 30, balance: 905 }), 1000)!;
  assert.deepEqual(c, { before: 1000, out: 100, inn: 30, expected: 930, printed: 905, diff: -25 });
  assert.equal(calcOf(row({ amount_out: 100, balance: 900 }), 1000)!.diff, 0);
  assert.equal(calcOf(row({ amount_out: 100 }), 1000)!.printed, null, "sổ không in số dư");
  assert.equal(calcOf(row({ amount_out: 100 }), 1000)!.diff, null);
  assert.equal(calcOf(row({ is_note: true, balance: 5 }), 1000), null);
  assert.equal(calcOf(row({ balance: 5 }), null), null);
});

test("stripSegments: dòng đã đủ lớn / tờ sổ hẹp thì MỘT đoạn; tờ rộng với chữ nhỏ thì cắt thành nhiều đoạn (tối đa 3)", () => {
  const rect = stripRect(bandsOf(5, { x0: 0, x1: 1 }), 2)!;                 // dòng cao 0.1 ảnh
  assert.equal(stripSegments(rect, 400, 1000).length, 1, "ảnh 400px rộng: dòng cao 100px, đã to sẵn");
  assert.equal(stripSegments(rect, 12000, 1000).length, 3, "ảnh 12000px rộng: phóng lên vẫn rộng ≥ 3 cột → chặn ở 3");
  const nho = stripRect(bandsOf(5, { x0: 0, x1: 1, bands: Array.from({ length: 5 }, (_, i) => ({ y0: 0.1 + i * 0.02, y1: 0.12 + i * 0.02 })) }), 2)!;
  assert.equal(stripSegments(nho, 1400, 1000).length, 3, "dòng cao 20px → phóng 2.2 lần: bề ngang 3000px+");
});

test("stripSegments: các đoạn phủ kín bề ngang tờ giấy, đoạn kề nhau lấn nhau một chút, không vượt ra ngoài", () => {
  const rect = stripRect(bandsOf(5, { x0: 0.1, x1: 0.9 }), 2)!;
  const segs = stripSegments(rect, 8000, 1000);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].x0, rect.cx0);
  assert.equal(segs[segs.length - 1].x1, rect.cx1);
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i].x0 < segs[i - 1].x1, `đoạn ${i} phải lấn sang đoạn ${i - 1}`);
  for (const sg of segs) assert.ok(sg.x0 >= rect.cx0 && sg.x1 <= rect.cx1 && sg.x1 > sg.x0);
});

test("stripSegments: dải cao 0 hoặc ảnh không rõ kích thước không làm hỏng (không NaN, ít nhất một đoạn)", () => {
  const rect = { cx0: 0, cx1: 1, cy0: 0, cy1: 1, y0: 0.5, y1: 0.5, exact: false, skew: 0 };
  const segs = stripSegments(rect, 1000, 1000);
  assert.ok(segs.length >= 1 && segs.every((x) => Number.isFinite(x.x0) && Number.isFinite(x.x1)));
  assert.equal(STRIP_COL_PX > 0, true);
});

test("chainBreaks: đếm dòng chuỗi số dư vẫn lệch — kể cả dòng người đã ✓ (✓ thắng «cần soát», không thắng chuỗi lệch)", () => {
  const rows = flatOf({ s1: [2, 2], s2: [3, 0] });
  assert.equal(chainBreaks(rows), 2);
  const daXacNhan = rows.map((r) => (r.chk === "NG" ? { ...r, need: false } : r));
  assert.equal(chainBreaks(daXacNhan), 2, "người ✓ thì hết «cần soát» nhưng chuỗi vẫn lệch");
  assert.equal(chainBreaks(flatOf({ s1: [3, 0] })), 0);
});
