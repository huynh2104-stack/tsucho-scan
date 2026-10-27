import type { Metadata } from 'next'
import V5Page from './v5/page'

/* Trang chính = bản V5 (người dùng chốt 27/10/2026). Mã nguồn V4
 * (components/studio-page.tsx, app/professional.css) không còn được dùng. */
export const metadata: Metadata = {
  title: '通帳スキャン | 通帳の明細を、検算済みの表へ。',
  description:
    '通帳の写真・PDFをAIが読み取り、全行を残高チェーンで検算。合わない行だけを黄色で示し、Excel・CSVに書き出します。',
}

export default V5Page
