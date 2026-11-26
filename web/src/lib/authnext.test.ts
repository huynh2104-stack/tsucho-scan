import assert from "node:assert/strict";
import { test } from "node:test";

import { _resetTokenCacheForTest, checkPasswordRules, safeNext, takeTokenFromUrl } from "./authnext.ts";

test("safeNext: chỉ nhận đường dẫn nội bộ", () => {
  assert.equal(safeNext("/cases/"), "/cases/");
  assert.equal(safeNext("/cases/?ws=a"), "/cases/?ws=a");
  assert.equal(safeNext("/cases/?a=1#b"), "/cases/?a=1#b");
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext("cases"), "/");
  assert.equal(safeNext("/\t/evil.com"), "/");
  assert.equal(safeNext("/\n/evil.com"), "/");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext("javascript:alert(1)"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("/x?u=https://evil.com"), "/");
});

test("takeTokenFromUrl: giữ được token qua 2 lần effect (React StrictMode)", () => {
  _resetTokenCacheForTest();
  const prevLoc = (globalThis as { location?: unknown }).location;
  const prevHist = (globalThis as { history?: unknown }).history;
  const loc = { pathname: "/verify/", hash: "#token=abc123", search: "" };
  (globalThis as { location: unknown }).location = loc;
  (globalThis as { history: unknown }).history = {
    replaceState: (_s: unknown, _t: string, url: string) => {
      loc.pathname = url;
      loc.hash = "";
      loc.search = "";
    },
  };
  try {
    assert.equal(takeTokenFromUrl(), "abc123");
    assert.equal(loc.hash, "");
    assert.equal(takeTokenFromUrl(), "abc123");
    loc.pathname = "/reset/";
    assert.equal(takeTokenFromUrl(), "");
  } finally {
    (globalThis as { location?: unknown }).location = prevLoc;
    (globalThis as { history?: unknown }).history = prevHist;
    _resetTokenCacheForTest();
  }
});

test("checkPasswordRules: bắt đủ độ dài 8–128, chữ hoa, chữ thường và số", () => {
  assert.deepEqual(checkPasswordRules("12345678"), { len: true, upper: false, lower: false, digit: true, ok: false });
  assert.deepEqual(checkPasswordRules("abcdefgh"), { len: true, upper: false, lower: true, digit: false, ok: false });
  assert.deepEqual(checkPasswordRules("ABCDEFGH"), { len: true, upper: true, lower: false, digit: false, ok: false });
  assert.deepEqual(checkPasswordRules("abcd1234"), { len: true, upper: false, lower: true, digit: true, ok: false });
  assert.deepEqual(checkPasswordRules("Abcd123"), { len: false, upper: true, lower: true, digit: true, ok: false });
  assert.deepEqual(checkPasswordRules("Abcd1234"), { len: true, upper: true, lower: true, digit: true, ok: true });
  assert.equal(checkPasswordRules("Aa1" + "x".repeat(126)).len, false);
});
