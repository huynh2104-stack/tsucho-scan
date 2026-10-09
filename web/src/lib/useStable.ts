import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Trả về một hàm CÓ DANH TÍNH CỐ ĐỊNH nhưng luôn gọi bản `fn` mới nhất (task 3.5).
 *
 * Vì sao: các hàm xử lý của trang (`editCell`, `deleteRow`…) được tạo lại sau mỗi lần vẽ, nên truyền thẳng xuống bảng thì
 * `React.memo` của `Row`/`AccountCard` vô dụng — mỗi lần chọn một dòng là cả bảng (hàng trăm dòng) vẽ lại. Hàm bọc này
 * không đổi danh tính, còn nội dung luôn thấy state mới nhất (gán lại trong `useLayoutEffect`, trước mọi sự kiện người dùng).
 * Không dùng cho hàm được gọi LÚC VẼ (nó sẽ thấy `fn` của lần vẽ trước).
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
