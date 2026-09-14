'use client'

import { Brand } from '@/components/brand'
import { DASHBOARD_URL } from '@/lib/constants'
import { LANGS, useI18n } from '@/lib/i18n'

export function SiteFooter() {
  const { t, lang, setLang } = useI18n()

  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 pt-10 pb-24 min-[560px]:pb-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="m-0 text-[17px] text-sumi">
            <Brand size={24} />
          </p>
          <p className="m-0 mt-1 max-w-[40ch] text-[13px] leading-relaxed text-sumi-2">
            {t.footer.tagline}
          </p>
          <a
            href={DASHBOARD_URL}
            className="mt-3 inline-block text-[13px] text-ao underline underline-offset-4 hover:text-sumi"
          >
            {t.footer.product}
          </a>
        </div>

        <div className="sm:text-right">
          <div className="flex gap-3 sm:justify-end">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={`text-[13px] underline-offset-4 hover:underline ${
                  lang === l.code ? 'font-medium text-sumi' : 'text-sumi-2'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="tnum m-0 mt-3 text-[12px] text-sumi-2">
            © {new Date().getFullYear()} {t.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  )
}
