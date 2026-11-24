import assert from "node:assert/strict";
import { test } from "node:test";

import { pinch, ZOOM_MAX, ZOOM_MIN, zoomAbout, type View } from "./viewgesture.ts";

/** Điểm ảnh (từ tâm ảnh, chưa phóng) đang nằm dưới điểm màn hình (px, py). */
const imgPt = (v: View, px: number, py: number) => ({ u: (px - v.x) / v.zoom, w: (py - v.y) / v.zoom });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("zoomAbout: giữ điểm neo — điểm ảnh dưới (px,py) trước và sau như nhau", () => {
  const v: View = { zoom: 1.7, x: 40, y: -25 };
  for (const z of [0.5, 1, 2.4, 5]) {
    const a = imgPt(v, 120, -80);
    const n = zoomAbout(v, 120, -80, z);
    const b = imgPt(n, 120, -80);
    near(a.u, b.u);
    near(a.w, b.w);
    near(n.zoom, z);
  }
});

test("zoomAbout: kẹp ở hai giới hạn và offset không trôi khi bị kẹp", () => {
  const top: View = { zoom: ZOOM_MAX, x: 10, y: 20 };
  assert.deepEqual(zoomAbout(top, 300, 300, 99), top);
  const bot: View = { zoom: ZOOM_MIN, x: -5, y: 7 };
  assert.deepEqual(zoomAbout(bot, 300, 300, 0.01), bot);
  assert.equal(zoomAbout({ zoom: 2, x: 0, y: 0 }, 1, 1, 100).zoom, ZOOM_MAX);
  assert.equal(zoomAbout({ zoom: 2, x: 0, y: 0 }, 1, 1, 0).zoom, ZOOM_MIN);
});

test("zoomAbout: zoom không đổi → view không đổi", () => {
  const v: View = { zoom: 2.2, x: 13, y: -9 };
  assert.deepEqual(zoomAbout(v, 77, 55, 2.2), v);
});

test("zoomAbout: zoom NaN không làm ra NaN", () => {
  const n = zoomAbout({ zoom: 1, x: 3, y: 4 }, 10, 10, NaN);
  assert.deepEqual(n, { zoom: 1, x: 3, y: 4 });
});

test("pinch: xoè ngón gấp đôi → zoom ×2, điểm ảnh dưới trung điểm đi theo trung điểm", () => {
  const view: View = { zoom: 1, x: 10, y: -20 };
  const s = { view, midX: 50, midY: 30, dist: 100 };
  const n = pinch(s, { midX: 50, midY: 30, dist: 200 });
  near(n.zoom, 2);
  const a = imgPt(view, 50, 30);
  const b = imgPt(n, 50, 30);
  near(a.u, b.u);
  near(a.w, b.w);
});

test("pinch: bị kẹp ở giới hạn", () => {
  const s = { view: { zoom: 4, x: 0, y: 0 }, midX: 0, midY: 0, dist: 10 };
  assert.equal(pinch(s, { midX: 0, midY: 0, dist: 1000 }).zoom, ZOOM_MAX);
  assert.equal(pinch(s, { midX: 0, midY: 0, dist: 0.001 }).zoom, ZOOM_MIN);
});

test("pinch: dời trung điểm, khoảng cách không đổi → chỉ tịnh tiến đúng độ dời", () => {
  const view: View = { zoom: 1.5, x: 5, y: 6 };
  const n = pinch({ view, midX: 20, midY: 20, dist: 80 }, { midX: 35, midY: 8, dist: 80 });
  near(n.zoom, 1.5);
  near(n.x, 5 + 15);
  near(n.y, 6 - 12);
});

test("pinch: dist 0 / âm / NaN không ra NaN", () => {
  const view: View = { zoom: 1.2, x: 1, y: 2 };
  for (const [d0, d1] of [[0, 50], [50, 0], [-5, 50], [50, -5], [NaN, 50], [50, NaN], [Infinity, 50]]) {
    const n = pinch({ view, midX: 0, midY: 0, dist: d0 }, { midX: 4, midY: 5, dist: d1 });
    assert.ok(Number.isFinite(n.zoom) && Number.isFinite(n.x) && Number.isFinite(n.y), `${d0},${d1}`);
    near(n.zoom, 1.2);
  }
});
