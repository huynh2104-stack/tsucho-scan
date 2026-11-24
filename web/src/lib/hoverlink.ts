/**
 * Kho «đang rê» dùng chung giữa ảnh và bảng.
 *
 * Nằm NGOÀI state của React cố ý: rê chuột đổi liên tục, mà trang (~2000 dòng) và bảng (hàng trăm dòng) không được vẽ lại
 * vì nó. Nơi nào cần vẽ theo thì dùng `useSyncExternalStore(subscribe, getHover, () => null)`; nơi chỉ cần đổi thuộc tính
 * DOM thì `subscribe` thẳng, không setState.
 */

/** `index` = thứ tự phẳng của dòng trong mặt sổ (cùng thứ tự với dải ảnh). */
export type Hover = { from: "image" | "table"; sheet: string; index: number } | null;

let current: Hover = null;
const listeners = new Set<() => void>();

const same = (a: Hover, b: Hover) =>
  a === b || (!!a && !!b && a.from === b.from && a.sheet === b.sheet && a.index === b.index);

export function getHover(): Hover {
  return current;
}

/** Bỏ qua nếu không đổi (so từng trường) — để rê trong cùng một dòng không đánh động ai. */
export function setHover(h: Hover): void {
  if (same(current, h)) return;
  current = h;
  [...listeners].forEach((fn) => fn());
}

/** Chỉ xoá nếu đang là nguồn đó (ảnh không xoá mục của bảng và ngược lại); không truyền = xoá hết. */
export function clearHover(from?: "image" | "table"): void {
  if (!current) return;
  if (from && current.from !== from) return;
  setHover(null);
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
