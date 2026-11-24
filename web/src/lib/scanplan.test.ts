import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanEstimate } from "./api.ts";
import { formatUsd, needsScanConfirm, overDemoQuota, scanHint } from "./scanplan.ts";

const est = (over: Partial<ScanEstimate> = {}): ScanEstimate => ({
  pages: 5, free: 3, new: 2, est_usd: 0.008, model: "m", demo_left: null, demo_limit: null, per_sheet: [], ...over,
});

test("scanHint: null / không có trang → none", () => {
  assert.deepEqual(scanHint(null), { kind: "none" });
  assert.deepEqual(scanHint(est({ pages: 0, free: 0, new: 0 })), { kind: "none" });
});

test("scanHint: toàn trang hỏng (new=0, free=0) → none; có trang hỏng lẫn trang khác thì theo free/new", () => {
  assert.deepEqual(scanHint(est({ pages: 2, free: 0, new: 0, bad: 2, est_usd: 0 })), { kind: "none" });
  assert.deepEqual(scanHint(est({ pages: 3, free: 1, new: 0, bad: 2, est_usd: 0 })), { kind: "allFree", pages: 1 });
  assert.deepEqual(scanHint(est({ pages: 3, free: 0, new: 2, bad: 1 })), { kind: "allNew", fresh: 2 });
});

test("scanHint: đủ ba nhánh", () => {
  assert.deepEqual(scanHint(est({ pages: 4, free: 4, new: 0, est_usd: 0 })), { kind: "allFree", pages: 4 });
  assert.deepEqual(scanHint(est()), { kind: "mixed", fresh: 2, free: 3 });
  assert.deepEqual(scanHint(est({ pages: 2, free: 0, new: 2 })), { kind: "allNew", fresh: 2 });
});

test("needsScanConfirm: chỉ khi có trang AI và (bật chi phí hoặc dùng thử)", () => {
  assert.equal(needsScanConfirm(null, true), false);
  assert.equal(needsScanConfirm(est(), false), false);
  assert.equal(needsScanConfirm(est(), true), true);
  assert.equal(needsScanConfirm(est({ demo_left: 4, demo_limit: 6 }), false), true);
  // không có trang mới thì không hỏi, dù bật chi phí hay dùng thử
  const free = est({ pages: 2, free: 2, new: 0, est_usd: 0, demo_left: 4 });
  assert.equal(needsScanConfirm(free, true), false);
  assert.equal(needsScanConfirm(free, false), false);
});

test("overDemoQuota", () => {
  assert.equal(overDemoQuota(null), false);
  assert.equal(overDemoQuota(est()), false);                       // tài khoản thường
  assert.equal(overDemoQuota(est({ demo_left: 2 })), false);       // vừa đủ
  assert.equal(overDemoQuota(est({ demo_left: 1 })), true);
  assert.equal(overDemoQuota(est({ demo_left: 0 })), true);        // hết lượt
  assert.equal(overDemoQuota(est({ pages: 2, free: 2, new: 0, demo_left: 0 })), false);   // toàn trang miễn phí
});

test("formatUsd", () => {
  assert.equal(formatUsd(null), null);
  assert.equal(formatUsd(0.008), "< $0.01");
  assert.equal(formatUsd(0), "< $0.01");
  assert.equal(formatUsd(0.01), "$0.01");
  assert.equal(formatUsd(0.126), "$0.13");
  assert.equal(formatUsd(12), "$12.00");
});
