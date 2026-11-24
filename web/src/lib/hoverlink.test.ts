import assert from "node:assert/strict";
import { test } from "node:test";

import { clearHover, getHover, setHover, subscribe } from "./hoverlink.ts";

test("setHover: cùng giá trị không gọi người nghe; khác thì gọi", () => {
  clearHover();
  let n = 0;
  const off = subscribe(() => n++);
  setHover({ from: "image", sheet: "a", index: 2 });
  assert.equal(n, 1);
  setHover({ from: "image", sheet: "a", index: 2 });   // đối tượng mới nhưng cùng nội dung
  assert.equal(n, 1);
  setHover({ from: "image", sheet: "a", index: 3 });
  assert.equal(n, 2);
  assert.deepEqual(getHover(), { from: "image", sheet: "a", index: 3 });
  off();
  clearHover();
});

test("clearHover: chỉ xoá đúng nguồn; không truyền thì xoá hết", () => {
  clearHover();
  setHover({ from: "image", sheet: "a", index: 0 });
  clearHover("table");
  assert.equal(getHover()?.from, "image");
  clearHover("image");
  assert.equal(getHover(), null);
  setHover({ from: "table", sheet: "a", index: 1 });
  clearHover();
  assert.equal(getHover(), null);
});

test("clearHover khi đang trống: không gọi người nghe", () => {
  clearHover();
  let n = 0;
  const off = subscribe(() => n++);
  clearHover("image");
  clearHover();
  assert.equal(n, 0);
  off();
});

test("subscribe: huỷ đăng ký thì thôi được gọi", () => {
  clearHover();
  let n = 0;
  const off = subscribe(() => n++);
  setHover({ from: "table", sheet: "a", index: 1 });
  off();
  setHover({ from: "table", sheet: "a", index: 2 });
  assert.equal(n, 1);
  clearHover();
});
