import assert from "node:assert/strict";
import { test } from "node:test";

import type { RowBands } from "./api.ts";
import { bandAt } from "./rowhit.ts";

const mk = (bands: RowBands["bands"], over: Partial<RowBands> = {}): RowBands => ({ bands, exact: true, skew_deg: 0, x0: 0.1, x1: 0.9, ...over });
const straight = mk([
  { y0: 0.10, y1: 0.14 },
  { y0: 0.15, y1: 0.19 },
  { y0: 0.20, y1: 0.24 },
]);

test("bandAt: dải thẳng — trúng đúng dải chứa điểm", () => {
  assert.equal(bandAt(straight, 0.5, 0.12, 0.7), 0);
  assert.equal(bandAt(straight, 0.5, 0.17, 0.7), 1);
  assert.equal(bandAt(straight, 0.5, 0.235, 0.7), 2);
});

test("bandAt: dải nghiêng — mép trái và mép phải trúng đúng dải (dòng cùng độ cao ở giữa nhưng lệch ở hai đầu)", () => {
  // 3° quanh tâm x=0.5; aspect 0.7 ⇒ ở fx=0.9 dải dời xuống 0.4*tan3°*0.7 ≈ 0.0147, ở fx=0.1 dời lên cùng lượng
  const skewed = mk([{ y0: 0.10, y1: 0.14 }, { y0: 0.15, y1: 0.19 }], { skew_deg: 3 });
  assert.equal(bandAt(skewed, 0.5, 0.12, 0.7), 0);
  assert.equal(bandAt(skewed, 0.9, 0.12 + 0.0147, 0.7), 0);
  assert.equal(bandAt(skewed, 0.1, 0.12 - 0.0147, 0.7), 0);
  // Điểm trôi theo dải: ở hai mép vẫn trúng dải 1 khi tính cả độ dời
  assert.equal(bandAt(skewed, 0.9, 0.17 + 0.0147, 0.7), 1);
  assert.equal(bandAt(skewed, 0.1, 0.17 - 0.0147, 0.7), 1);
});

test("bandAt: dải có skew_deg riêng thì dùng riêng, không dùng của cả trang", () => {
  const b = mk([{ y0: 0.10, y1: 0.14, skew_deg: 5 }], { skew_deg: 0 });
  const shift = 0.4 * Math.tan((5 * Math.PI) / 180) * 1;
  assert.equal(bandAt(b, 0.9, 0.12 + shift, 1), 0);
});

test("bandAt: hai khối cạnh nhau cùng độ cao nhưng khác x", () => {
  const two = mk([
    { y0: 0.10, y1: 0.14, x0: 0.05, x1: 0.45 },
    { y0: 0.10, y1: 0.14, x0: 0.55, x1: 0.95 },
  ], { x0: 0, x1: 1 });
  assert.equal(bandAt(two, 0.2, 0.12, 0.7), 0);
  assert.equal(bandAt(two, 0.8, 0.12, 0.7), 1);
  assert.equal(bandAt(two, 0.5, 0.12, 0.7), null);       // nếp gấp giữa hai cuốn
});

test("bandAt: khe trống lớn giữa hai nhóm dải và vùng ngoài → null", () => {
  const gap = mk([{ y0: 0.10, y1: 0.14 }, { y0: 0.60, y1: 0.64 }]);
  assert.equal(bandAt(gap, 0.5, 0.35, 0.7), null);
  assert.equal(bandAt(gap, 0.5, 0.02, 0.7), null);       // tiêu đề phía trên
  assert.equal(bandAt(gap, 0.5, 0.95, 0.7), null);
  assert.equal(bandAt(gap, 0.0, 0.12, 0.7), null);       // lề ngoài tờ giấy
});

test("bandAt: lệch nhẹ trong dung sai → dải gần nhất; xa hơn 0.35 chiều cao dải → null", () => {
  const b = mk([{ y0: 0.10, y1: 0.14 }, { y0: 0.30, y1: 0.34 }]);
  assert.equal(bandAt(b, 0.5, 0.15, 0.7), 0);            // 0.01 ≤ 0.35*0.04=0.014
  assert.equal(bandAt(b, 0.5, 0.29, 0.7), 1);
  assert.equal(bandAt(b, 0.5, 0.16, 0.7), null);         // 0.02 > 0.014
});

test("bandAt: bands null, dải cao 0, danh sách rỗng", () => {
  assert.equal(bandAt(null, 0.5, 0.5, 1), null);
  assert.equal(bandAt(mk([{ y0: 0.2, y1: 0.2 }]), 0.5, 0.2, 1), null);
  assert.equal(bandAt(mk([{ y0: 0.3, y1: 0.2 }]), 0.5, 0.25, 1), null);
  assert.equal(bandAt(mk([]), 0.5, 0.5, 1), null);
});

test("bandAt: nhiều dải cùng chứa điểm → dải có tâm gần nhất", () => {
  const overlap = mk([{ y0: 0.10, y1: 0.20 }, { y0: 0.18, y1: 0.28 }]);
  assert.equal(bandAt(overlap, 0.5, 0.185, 0.7), 0);     // tâm 0.15 gần hơn tâm 0.23
  assert.equal(bandAt(overlap, 0.5, 0.21, 0.7), 1);
});

test("bandAt: aspect không hợp lệ (ảnh chưa có kích thước) → null", () => {
  const b = mk([{ y0: 0.1, y1: 0.14 }]);
  assert.equal(bandAt(b, 0.5, 0.12, 0), null);
  assert.equal(bandAt(b, 0.5, 0.12, NaN), null);
  assert.equal(bandAt(b, 0.5, 0.12, Infinity), null);
  assert.equal(bandAt(b, 0.5, 0.12, 0.7), 0);
});

test("bandAt: dải suy ra lọt trong dải khớp nội dung → luôn ra dải khớp, bấm đâu trong vùng chồng cũng vậy", () => {
  const b = mk([
    { y0: 0.80, y1: 0.84, method: "content" },
    { y0: 0.805, y1: 0.831, method: "inferred" },
  ]);
  for (const fy of [0.806, 0.815, 0.82, 0.83]) assert.equal(bandAt(b, 0.5, fy, 0.7), 0);
  // thứ tự dải đảo ngược cũng không đổi kết quả
  const r = mk([
    { y0: 0.805, y1: 0.831, method: "inferred" },
    { y0: 0.80, y1: 0.84, method: "content" },
  ]);
  for (const fy of [0.806, 0.818, 0.83]) assert.equal(bandAt(r, 0.5, fy, 0.7), 1);
  // ngoài vùng chồng: dải suy ra vẫn được chọn nếu chỉ nó chứa điểm
  const only = mk([{ y0: 0.80, y1: 0.84, method: "inferred" }]);
  assert.equal(bandAt(only, 0.5, 0.82, 0.7), 0);
});

test("bandAt: cùng hạng thì tâm gần nhất; thiếu method coi như estimated", () => {
  const same = mk([{ y0: 0.10, y1: 0.20, method: "content" }, { y0: 0.14, y1: 0.24, method: "content" }]);
  assert.equal(bandAt(same, 0.5, 0.18, 0.7), 1);
  const none = mk([{ y0: 0.10, y1: 0.20 }, { y0: 0.12, y1: 0.18, method: "inferred" }]);
  assert.equal(bandAt(none, 0.5, 0.15, 0.7), 1);
});
