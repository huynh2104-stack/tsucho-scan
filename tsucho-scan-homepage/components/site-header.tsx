'use client'

import { useEffect, useState } from 'react'
import { Brand } from '@/components/brand'
import { DASHBOARD_URL } from '@/lib/constants'
import { LANGS, useI18n } from '@/lib/i18n'

/* Thanh trên cùng là một đường kẻ của tờ sổ, không phải thẻ kính nổi.
 * Trên màn hình hẹp, các mục gập xuống thành một khối kẻ dòng — vẫn là
 * tờ giấy, không phải ngăn kéo trượt. */
export function SiteHeader() {
  const { t, lang, setLang } = useI18n()
  const [mo, setMo] = useState(false)

  // Đóng menu khi màn hình rộng ra, nếu không nó kẹt mở ở bản máy tính
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const dong = () => mq.matches && setMo(false)
    mq.addEventListener('change', dong)
    return () => mq.removeEventListener('change', dong)
  }, [])

  const muc = [
    { href: '#reads', label: t.nav.reads },
    { href: '#verify', label: t.nav.verify },
    { href: '#how', label: t.nav.how },
    { href: '#output', label: t.nav.output },
    { href: '#limits', label: t.nav.limits },
    { href: '#pricing', label: t.nav.pricing },
    { href: '#faq', label: t.nav.faq },
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-4 py-2.5 sm:px-6">
        <a href="#top" className="text-[16px] text-sumi sm:text-[18px]">
          <Brand size={22} />
        </a>

        <nav aria-label={t.nav.menu} className="ml-auto hidden items-center gap-6 min-[900px]:flex">
          {muc.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="text-[13.5px] text-sumi-2 underline-offset-[6px] hover:text-sumi hover:underline"
            >
              {m.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 min-[900px]:ml-0">
          <div
            role="group"
            aria-label={t.footer.langLabel}
            className="mr-1 hidden overflow-hidden rounded-sm border border-rule min-[560px]:flex"
          >
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={`px-2 py-1 text-[11px] font-medium ${
                  lang === l.code
                    ? 'bg-sumi text-paper'
                    : 'bg-paper-3 text-sumi-2 hover:bg-paper-2'
                }`}
              >
                {l.short}
              </button>
            ))}
          </div>

          <a
            href={DASHBOARD_URL}
            className="hidden rounded-sm px-3 py-1.5 text-[13px] text-sumi-2 hover:text-sumi min-[560px]:inline-block"
          >
            {t.nav.login}
          </a>
          <a
            href={DASHBOARD_URL}
            className="rounded-sm bg-shu px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-paper-3 hover:brightness-110 sm:px-3.5 sm:text-[13px]"
          >
            {t.nav.start}
          </a>

          <button
            onClick={() => setMo((v) => !v)}
            aria-expanded={mo}
            aria-label={t.nav.menu}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-sm border border-rule text-sumi-2 min-[900px]:hidden"
          >
            <span aria-hidden className="text-[15px] leading-none">
              {mo ? '×' : '≡'}
            </span>
          </button>
        </div>
      </div>

      {mo && (
        <nav
          aria-label={t.nav.menu}
          className="border-t border-rule bg-paper-3 min-[900px]:hidden"
        >
          {muc.map((m) => (
            <a
              key={m.href}
              href={m.href}
              onClick={() => setMo(false)}
              className="block border-b border-rule-soft px-4 py-2.5 text-[14px] text-sumi-2 hover:bg-paper-2 hover:text-sumi sm:px-6"
            >
              {m.label}
            </a>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 min-[560px]:hidden sm:px-6">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={`text-[13.5px] underline-offset-4 hover:underline ${
                  lang === l.code ? 'font-medium text-sumi' : 'text-sumi-2'
                }`}
              >
                {l.label}
              </button>
            ))}
            <a
              href={DASHBOARD_URL}
              className="ml-auto text-[13.5px] text-sumi-2 underline underline-offset-4"
            >
              {t.nav.login}
            </a>
          </div>
        </nav>
      )}
    </header>
  )
}
