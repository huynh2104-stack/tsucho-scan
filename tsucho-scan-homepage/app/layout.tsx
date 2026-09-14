import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import {
  Be_Vietnam_Pro,
  IBM_Plex_Mono,
  Klee_One,
  Newsreader,
  Shippori_Mincho,
  Zen_Kaku_Gothic_New,
} from 'next/font/google'
import { MotionRoot } from '@/components/motion-root'
import { LanguageProvider } from '@/lib/i18n'
import './globals.css'

/* Ba vai trò chữ, mỗi vai lấy từ một thứ có thật trên cuốn sổ.
 *
 * Biểu mẫu in sẵn dùng chữ MINH TRIỀU (明朝) → tiêu đề dùng Minh Triều.
 * Máy in kim in dữ liệu bằng chữ đều bề ngang → mọi con số dùng mono.
 * Phần còn lại là chữ giao diện, cần đọc dễ ở cả ba thứ tiếng.
 *
 * Mẹo xếp font: font Latin đứng TRƯỚC, font Nhật đứng SAU. Chữ Việt có
 * dấu nằm trọn trong font Latin nên không bị vỡ, còn chữ Nhật rơi xuống
 * font Nhật theo từng ký tự. Đảo ngược thứ tự là chữ Việt vỡ giữa từ vì
 * font Nhật không có 'ắ', 'ữ'.
 */
const newsreader = Newsreader({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

const shippori = Shippori_Mincho({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-shippori',
  display: 'swap',
})

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-bevietnam',
  display: 'swap',
})

const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-zenkaku',
  display: 'swap',
})

/* Chữ VIẾT TAY. Nhân viên ngân hàng ghi tay dòng cuối sổ bằng bút, và
 * trang này có một dòng như thế để cho thấy máy vẫn đọc đúng. Klee One là
 * kiểu chữ bút sắt của Nhật — dùng ĐÚNG một chỗ đó, không dùng chỗ khác. */
const kleeOne = Klee_One({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-klee',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-plexmono',
  display: 'swap',
})

/* Phần mô tả chỉ nói những gì ứng dụng LÀM ĐƯỢC THẬT. Bản cũ hứa
 * "tự động仕訳・分類" và "月次レポート" — hai thứ ứng dụng không có. */
export const metadata: Metadata = {
  metadataBase: new URL('https://tsucho-scan.vercel.app'),
  title: '通帳スキャン — 通帳の明細を、検算済みのExcelへ',
  description:
    '日本の銀行通帳（ゆうちょ・普通預金など）の画像やPDFを読み取り、Excel／CSVに書き出します。残高チェーンで全行を検算し、機械が迷った箇所だけ黄色で示すので、人が直すのは数行だけです。',
  keywords: [
    '通帳スキャン',
    '通帳 OCR',
    '通帳 Excel 変換',
    'tsucho-scan',
    '銀行明細 CSV',
    '残高チェーン',
  ],
  openGraph: {
    title: '通帳スキャン — 通帳の明細を、検算済みのExcelへ',
    description:
      '通帳の画像・PDFを読み取り、残高チェーンで全行を検算してExcel／CSVへ。迷った箇所は黄色で示します。',
    type: 'website',
    locale: 'ja_JP',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#eff0ea',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${newsreader.variable} ${shippori.variable} ${beVietnam.variable} ${zenKaku.variable} ${plexMono.variable} ${kleeOne.variable}`}
    >
      <body className="min-h-dvh antialiased">
        {/* LƯỚI AN TOÀN. Motion viết `opacity:0` thẳng vào thẻ ngay từ lúc
            dựng trên máy chủ, nên nếu trình duyệt không chạy JavaScript thì
            những khối chờ hiện sẽ nằm ẩn mãi mãi. Đoạn này ép chúng hiện.
            Phải là `!important` vì kiểu nội tuyến thắng mọi bảng kiểu. */}
        <noscript>
          <style>{`[data-motion]{opacity:1!important;transform:none!important}[data-faq-panel]{grid-template-rows:1fr!important}`}</style>
        </noscript>
        <MotionRoot>
          <LanguageProvider>{children}</LanguageProvider>
        </MotionRoot>
        <Analytics />
      </body>
    </html>
  )
}
