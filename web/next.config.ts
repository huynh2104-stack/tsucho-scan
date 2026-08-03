import type { NextConfig } from "next";

/**
 * `output: "export"` → `npm run build` sinh ra thư mục `out/` gồm HTML/CSS/JS
 * tĩnh, không cần máy chủ Node.
 *
 * Vì sao chọn cách này: toàn bộ app là client component (`"use client"`), mọi
 * dữ liệu lấy qua API FastAPI. Xuất tĩnh cho phép **chính FastAPI phục vụ luôn
 * trang web**, nên khi triển khai chỉ có MỘT dịch vụ, MỘT tên miền:
 *   • không còn CORS (cùng gốc),
 *   • cookie phiên thành first-party nên `SameSite=Lax` là đủ,
 *   • người dùng chỉ nhận một đường link duy nhất.
 *
 * `npm run dev` không bị ảnh hưởng — vẫn chạy máy chủ dev như thường.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Mỗi route thành `<route>/index.html` — máy chủ tĩnh nào cũng phục vụ được
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
