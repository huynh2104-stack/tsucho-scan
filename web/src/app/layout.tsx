import type { Metadata } from "next";
import { BIZ_UDPGothic, Be_Vietnam_Pro, Noto_Sans_JP, Shippori_Antique } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { CaseProvider } from "@/lib/case";
import { CorrectionsProvider } from "@/lib/corrections-provider";
import { PrefsProvider } from "@/lib/prefs";
import { FONT_SCALES, FONT_SCALE_KEY } from "@/lib/prefs-defaults";
import { LangProvider } from "@/lib/i18n";
import { ThemeProvider, THEME_KEY } from "@/lib/theme";
import { TourProvider } from "@/lib/tour";
import TopBar from "@/components/TopBar";

/* preload: false vì phông Nhật chia hàng trăm lát theo unicode-range: trình duyệt chỉ tải lát có chữ cần dùng. */
const uiFont = BIZ_UDPGothic({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-ui",
  display: "swap",
  preload: false,
});
/* Số tiền: Noto Sans JP với số đều bề ngang. BIZ UDGothic đã thử: dấu phẩy chiếm trọn một ô chữ nên 88,699
   trông như "88, 699". Kế toán đọc số cả ngày nên chỗ này không nhân nhượng. */
const dataFont = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-data",
  display: "swap",
  preload: false,
});
const viFont = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "700"],
  variable: "--font-vi",
  display: "swap",
  preload: false,
});
/* Nét mực loang kiểu chữ cổ: chỉ dùng cho chữ trong con dấu */
const sealFont = Shippori_Antique({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-seal",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "通帳スキャン｜通帳の写真・PDFをExcelに",
  description:
    "通帳の写真・PDFを読み取り、残高の連続チェックで確かめながらExcelに変換します。画像と表を並べて確認できます。",
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
  // Cỡ chữ lớn (tuỳ chọn): đặt sớm cùng chủ đề để chữ không nhảy cỡ sau khi tải xong
  try {
    var fs = parseFloat(localStorage.getItem(${JSON.stringify(FONT_SCALE_KEY)}));
    if (${JSON.stringify(FONT_SCALES)}.indexOf(fs) >= 0) document.documentElement.style.setProperty("--fs", String(fs));
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ja"
      className={`h-full antialiased ${uiFont.variable} ${dataFont.variable} ${viFont.variable} ${sealFont.variable}`}
      suppressHydrationWarning
    >
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
              {/* PrefsProvider: cài đặt theo tài khoản — phải biết ai đang đăng nhập, và đổi được ngôn ngữ/chủ đề */}
              <PrefsProvider>
                {/* CorrectionsProvider: từ điển sửa lỗi của người dùng (cần biết `dictMode` trong cài đặt) */}
                <CorrectionsProvider>
                  <TourProvider>
                    {/* CaseProvider: thanh trên cần biết hồ sơ nào đang mở ở bàn làm việc */}
                    <CaseProvider>
                      <TopBar />
                      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
                    </CaseProvider>
                  </TourProvider>
                </CorrectionsProvider>
              </PrefsProvider>
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
