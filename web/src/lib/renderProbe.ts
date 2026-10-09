/**
 * Đếm số lần một component được vẽ — CHỈ khi kịch bản thử (E2E) chủ động bật bằng `window.__renders = {}` (task 3.5).
 *
 * Vì sao có: sự cố «chọn một dòng làm cả bảng vẽ lại» không để lại dấu vết nào trên DOM (React vẽ lại mà không đổi gì thì
 * không có thay đổi để quan sát), nên không bắt được bằng cách nhìn trang. Một người sau này truyền thêm một hàm tạo-mới-
 * mỗi-lần-vẽ xuống `Row` là `React.memo` vô hiệu mà mọi thứ vẫn chạy đúng, chỉ chậm. Bài thử đọc bộ đếm này để chặn chuyện đó.
 * Bình thường (không có `window.__renders`) mỗi lần gọi chỉ tốn một phép kiểm thuộc tính.
 */
export function renderProbe(name: string): void {
  const store = (globalThis as { __renders?: Record<string, number> }).__renders;
  if (store) store[name] = (store[name] ?? 0) + 1;
}
