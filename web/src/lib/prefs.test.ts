import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_PREFS, mergePrefs } from "./prefs-defaults.ts";

test("DEFAULT_PREFS khớp file mặc định chung với máy chủ (api/prefs.py)", () => {
  const shared = JSON.parse(readFileSync(new URL("../../../tests/fixtures/prefs_defaults.json", import.meta.url), "utf-8"));
  assert.deepEqual(DEFAULT_PREFS, shared);
});

test("mặc định: mọi tuỳ chọn thay đổi hành vi đều TẮT sẵn, từ điển chỉ gợi ý", () => {
  assert.equal(DEFAULT_PREFS.showCost, false);
  assert.equal(DEFAULT_PREFS.autoRotate, false);
  assert.equal(DEFAULT_PREFS.autoFixOnUpload, false);
  assert.equal(DEFAULT_PREFS.accountingMode, false);
  assert.equal(DEFAULT_PREFS.dictMode, "suggest");
  assert.equal(DEFAULT_PREFS.fontScale, 1);
});

test("mergePrefs: chỉ đổi khoá được gửi, không sửa đối tượng cũ", () => {
  const out = mergePrefs(DEFAULT_PREFS, { fontScale: 1.3, lang: "ja" });
  assert.deepEqual(out, { ...DEFAULT_PREFS, fontScale: 1.3, lang: "ja" });
  assert.equal(DEFAULT_PREFS.fontScale, 1);
  assert.equal(DEFAULT_PREFS.lang, null);
  assert.equal(mergePrefs(DEFAULT_PREFS, {}).dictMode, "suggest");
});
