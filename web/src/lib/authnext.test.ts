import assert from "node:assert/strict";
import { test } from "node:test";

import { safeNext } from "./authnext.ts";

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
