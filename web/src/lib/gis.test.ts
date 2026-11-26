import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  _resetForTest,
  disableGisAutoSelect,
  gisNeedsInit,
  initGis,
  loadGis,
  renderGisButton,
  resetGisInit,
  setGisHandler,
  type GisId, type GisWindow,
} from "./gis.ts";

/** Cửa sổ giả: `createElement("script")` ghi lại thẻ; test tự gọi onload/onerror. */
function fakeWin(withGoogle = false) {
  const scripts: Record<string, unknown>[] = [];
  const calls = { initialize: [] as Record<string, unknown>[], render: [] as { el: unknown; o: Record<string, unknown> }[], disabled: 0 };
  const id: GisId = {
    initialize: (o) => calls.initialize.push(o),
    renderButton: (el, o) => calls.render.push({ el, o }),
    disableAutoSelect: () => calls.disabled++,
  };
  const win = {
    google: withGoogle ? { accounts: { id } } : undefined,
    document: {
      createElement: () => {
        const s: Record<string, unknown> = { remove() {} };
        scripts.push(s);
        return s;
      },
      head: { appendChild: () => {} },
    },
  } as unknown as GisWindow;
  return { win, scripts, calls, id };
}

beforeEach(() => _resetForTest());

test("loadGis: script lỗi mạng → reject (giữ nút dự phòng), lần sau thử lại được", async () => {
  const { win, scripts } = fakeWin();
  const p = loadGis(win);
  (scripts[0].onerror as () => void)();
  await assert.rejects(p);
  const p2 = loadGis(win);
  assert.equal(scripts.length, 2);
  (scripts[1].onerror as () => void)();
  await assert.rejects(p2);
});

test("loadGis: nạp xong mà không có window.google → reject; có → resolve, chỉ nạp một lần", async () => {
  const f = fakeWin();
  const p = loadGis(f.win);
  assert.strictEqual(loadGis(f.win), p);
  assert.equal(f.scripts.length, 1);
  (f.win as unknown as { google: unknown }).google = { accounts: { id: f.id } };
  (f.scripts[0].onload as () => void)();
  assert.strictEqual(await p, f.id);
});

test("loadGis: quá thời gian → reject", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { win } = fakeWin();
  const p = loadGis(win);
  t.mock.timers.tick(8001);
  await assert.rejects(p);
});

test("initGis: đưa nonce của máy chủ + use_fedcm_for_button, callback chuyển credential tới handler hiện tại", () => {
  const { id, calls } = fakeWin(true);
  const got: string[] = [];
  setGisHandler((c) => got.push("cũ:" + c));
  initGis(id, "cid.apps", "NONCE1");
  const o = calls.initialize[0];
  assert.equal(o.client_id, "cid.apps");
  assert.equal(o.nonce, "NONCE1");
  assert.equal(o.use_fedcm_for_button, true);
  assert.equal(o.auto_select, false);
  assert.equal(o.ux_mode, "popup");
  (o.callback as (r: unknown) => void)({ credential: "A" });
  (o.callback as (r: unknown) => void)({});
  // gắn lại component: handler mới nhận, handler cũ KHÔNG còn được gọi (kể cả qua callback đã đưa cho Google)
  setGisHandler((c) => got.push("mới:" + c));
  (o.callback as (r: unknown) => void)({ credential: "B" });
  setGisHandler(null);
  assert.doesNotThrow(() => (o.callback as (r: unknown) => void)({ credential: "C" }));
  assert.deepEqual(got, ["cũ:A", "mới:B"]);
});

test("gisNeedsInit: chưa init, nonce quá 25 phút → cần; còn mới → không; resetGisInit → cần", () => {
  const { id } = fakeWin(true);
  assert.equal(gisNeedsInit(1_000), true);
  initGis(id, "c", "n", 1_000);
  assert.equal(gisNeedsInit(1_000 + 24 * 60_000), false);
  assert.equal(gisNeedsInit(1_000 + 25 * 60_000 + 1), true);
  resetGisInit();
  assert.equal(gisNeedsInit(1_000), true);
});

test("renderGisButton: locale, giao diện sáng/tối, độ rộng kẹp 200–400", () => {
  const { id, calls } = fakeWin(true);
  const el = { replaceChildren() {} } as unknown as HTMLElement;
  renderGisButton(id, el, { theme: "light", lang: "ja", width: 520 });
  renderGisButton(id, el, { theme: "dark", lang: "vi", width: 120 });
  assert.deepEqual(
    calls.render.map((r) => [r.o.theme, r.o.locale, r.o.width]),
    [["outline", "ja", 400], ["filled_black", "vi", 200]],
  );
  assert.equal(calls.render[0].o.text, "signin_with");
});

test("disableGisAutoSelect: gọi khi có GIS, im lặng khi chưa nạp", () => {
  const a = fakeWin(true);
  disableGisAutoSelect(a.win);
  assert.equal(a.calls.disabled, 1);
  assert.doesNotThrow(() => disableGisAutoSelect(fakeWin(false).win));
  assert.doesNotThrow(() => disableGisAutoSelect(undefined));
});
