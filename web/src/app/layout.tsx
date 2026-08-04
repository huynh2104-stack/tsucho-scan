import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LangProvider } from "@/lib/i18n";
import { ThemeProvider, THEME_KEY } from "@/lib/theme";
import { TourProvider } from "@/lib/tour";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "通帳スキャン — Sổ ngân hàng Nhật sang Excel",
  description:
    "Đọc ảnh/PDF sổ ngân hàng Nhật (通帳) thành Excel, có engine kiểm tra chuỗi số dư và màn hình đối chiếu ảnh ↔ bảng.",
};

/* Chạy đồng bộ trước khi trình duyệt vẽ khung hình đầu tiên: nếu đợi React
   hydrate mới đặt chủ đề thì người dùng thấy một nháy trắng. Xem docs Next
   "preventing-flash-before-hydration". */
const themeScript = `
(function(){
  try {
    var m = localStorage.getItem(${JSON.stringify(THEME_KEY)}) || "system";
    var dark = m === "dark" || (m === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Khung app CAO ĐÚNG MÀN HÌNH và không cho cả trang cuộn: nhờ vậy mỗi
          cột tự có thanh cuộn riêng. Thiếu chỗ này thì click mặt sổ làm cả
          trang trôi thay vì chỉ cột kết quả trôi. */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <ThemeProvider>
          <LangProvider>
            <AuthProvider>
              {/* TourProvider nằm TRONG AuthProvider: "đã xem hướng dẫn chưa"
                  ghi theo từng người dùng nên phải biết ai đang đăng nhập. */}
              <TourProvider>
                <TopBar />
                <main className="flex min-h-0 flex-1 flex-col">{children}</main>
              </TourProvider>
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
