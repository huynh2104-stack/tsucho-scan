import type { Metadata } from 'next'
import { Doto, DotGothic16, Shippori_Mincho_B1 } from 'next/font/google'
import { V5Page } from '@/components/v5/v5-page'
import './v5.css'

/* Ba phông chỉ trang V5 dùng, khai báo ở đây để không tải cho trang khác.
 *
 * Doto + DotGothic16 là MỰC IN KIM: máy 記帳 của ngân hàng in số và chữ
 * bằng từng chấm. Doto lo phần số (*25,024), DotGothic16 lo kana/kanji.
 * Shippori Mincho B1 là Minh Triều có vệt mực đọng ở góc nét, giống chữ
 * in trên giấy hơn là chữ trên màn hình; dùng cho tiêu đề. */
const doto = Doto({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['ROND'],
  variable: '--font-doto',
  display: 'swap',
})

const dotGothic = DotGothic16({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dotgothic',
  preload: false,
  display: 'swap',
})

const shipporiB1 = Shippori_Mincho_B1({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--font-shippori-b1',
  preload: false,
  display: 'swap',
})

export const metadata: Metadata = {
  title: '通帳スキャン | 通帳の明細を、検算済みの表へ。',
  description:
    '通帳の写真・PDFをAIが読み取り、全行を残高チェーンで検算。合わない行だけを黄色で示し、Excel・CSVに書き出します。',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <div className={`${doto.variable} ${dotGothic.variable} ${shipporiB1.variable}`}>
      <V5Page />
    </div>
  )
}
