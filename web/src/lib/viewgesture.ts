/**
 * Toán cử chỉ cho khung xem ảnh sổ (lăn chuột, chụm hai ngón).
 *
 * Quy ước toạ độ (khớp `SheetViewer`): gốc ở TÂM khung xem; ảnh vẽ bằng
 * `translate(x, y) scale(zoom)` quanh tâm của chính nó. Điểm ảnh u (tính từ tâm ảnh,
 * chưa phóng) nằm trên màn hình ở `x + zoom * u`.
 */

/** Giới hạn phóng/thu — dùng chung cho nút bấm, lăn chuột và chụm. */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 6;

export type View = { zoom: number; x: number; y: number };

const kep = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** Phóng tới `zoom` mà điểm (px, py) của khung vẫn nằm trên cùng một điểm ảnh. */
export function zoomAbout(v: View, px: number, py: number, zoom: number): View {
  const z = kep(Number.isFinite(zoom) ? zoom : v.zoom);
  // Bị kẹp hoặc không đổi thì k = 1 → offset đứng yên, không trôi
  const k = z / v.zoom;
  return { zoom: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Chụm hai ngón: điểm ảnh nằm dưới trung điểm lúc đầu đi theo trung điểm hiện tại. */
export function pinch(
  start: { view: View; midX: number; midY: number; dist: number },
  now: { midX: number; midY: number; dist: number },
): View {
  const { view: v0 } = start;
  // Khoảng cách hỏng (0, âm, NaN) thì coi như không phóng — chỉ tịnh tiến, không sinh NaN
  const ok = start.dist > 0 && now.dist > 0 && Number.isFinite(start.dist) && Number.isFinite(now.dist);
  const z = kep(ok ? v0.zoom * (now.dist / start.dist) : v0.zoom);
  const k = z / v0.zoom;
  return {
    zoom: z,
    x: now.midX - (start.midX - v0.x) * k,
    y: now.midY - (start.midY - v0.y) * k,
  };
}
