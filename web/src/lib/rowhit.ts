/**
 * «Bấm vào ảnh → chọn dòng»: tìm dải (dòng) nằm dưới một điểm của ảnh. Hàm thuần, có test (`rowhit.test.ts`).
 * Toạ độ dải là của `RowBands` (xem `lib/api.ts`); phép nghiêng khớp đúng `skewY` mà SheetViewer vẽ cho khung đỏ.
 */

import type { RowBands } from "./api.ts";

/** Lề ngang nới thêm cho mỗi dải: số dư in sát mép có thể nằm hơi ngoài `x1` đo được. */
const X_TOL = 0.02;
/** Điểm rơi vào khe giữa hai dòng vẫn được tính cho dòng gần nhất, nếu cách mép không quá ngần này × chiều cao dòng. */
const NEAR_TOL = 0.35;

/** Độ tin của cách tìm ra dải: càng cao càng thắng khi nhiều dải chồng nhau. */
const RANK = { content: 2, inferred: 1, estimated: 0 } as const;

/** Dải (dòng) nằm dưới điểm (fx, fy) của ảnh — fx, fy là tỉ lệ 0..1 theo bề ngang / chiều cao ảnh; aspect = rộng/cao của ảnh. null = không trúng dòng nào. */
export function bandAt(bands: RowBands | null, fx: number, fy: number, aspect: number): number | null {
  // Ảnh chưa có kích thước thì aspect không dùng được (NaN/0/Infinity): không đoán
  if (!bands || !Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(aspect) || !(aspect > 0)) return null;
  let inside: number | null = null;
  let insideRank = -1;
  let insideGap = Infinity;
  let near: number | null = null;
  let nearGap = Infinity;
  bands.bands.forEach((band, i) => {
    if (!(band.y1 > band.y0)) return;
    const x0 = band.x0 ?? bands.x0 ?? 0;
    const x1 = band.x1 ?? bands.x1 ?? 1;
    // Hai cuốn sổ cạnh nhau có dải cùng độ cao nhưng khác x: chỉ xét dải có bề ngang chứa điểm
    if (fx < x0 - X_TOL || fx > x1 + X_TOL) return;
    const skew = band.skew_deg ?? bands.skew_deg ?? 0;
    // skewY của CSS xoay quanh TÂM khung, nên độ dời dọc tại fx tỉ lệ với khoảng cách tới tâm; quy về tỉ lệ chiều cao ảnh bằng aspect
    const shift = (fx - (x0 + x1) / 2) * Math.tan((skew * Math.PI) / 180) * aspect;
    const top = band.y0 + shift;
    const bottom = band.y1 + shift;
    if (fy >= top && fy <= bottom) {
      // Nhiều dải cùng chứa điểm: bằng chứng cao hơn thắng (dòng có chữ thật trên giấy thắng dòng chỉ được suy ra — dòng ghi
      // chú không có chỗ riêng trên giấy nên bị xếp lọt trong dòng in; nó vẫn chọn được từ bảng). Cùng hạng mới xét tâm gần nhất.
      const rank = RANK[band.method ?? "estimated"];
      const gap = Math.abs(fy - (top + bottom) / 2);
      if (rank > insideRank || (rank === insideRank && gap < insideGap)) {
        insideRank = rank;
        insideGap = gap;
        inside = i;
      }
      return;
    }
    const edge = fy < top ? top - fy : fy - bottom;
    if (edge <= NEAR_TOL * (band.y1 - band.y0) && edge < nearGap) {
      nearGap = edge;
      near = i;
    }
  });
  return inside ?? near;
}
