import Link from 'next/link'
import type { ReactNode } from 'react'

/* Khung chung cho プライバシーポリシー và 利用規約: một tờ giấy chữ đọc dễ, không hiệu ứng.
 * Bản tiếng Nhật là bản chính (正本); chưa có bản vi/en. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="legal">
      <div className="legal-sheet">
        <p className="legal-back">
          <Link href="/">← 通帳スキャン トップへ</Link>
        </p>
        <h1>{title}</h1>
        <p className="legal-date">{updated}</p>
        {children}
        <nav className="legal-foot" aria-label="規約">
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/terms">利用規約</Link>
          <a href="mailto:contact@tsucho-scan.com">contact@tsucho-scan.com</a>
        </nav>
      </div>
    </main>
  )
}
