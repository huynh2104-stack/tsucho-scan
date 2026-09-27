'use client'

import { useEffect, useRef, useState } from 'react'
import { Brand } from '@/components/brand'
import { DASHBOARD_URL } from '@/lib/constants'
import { LANGS, useI18n } from '@/lib/i18n'

/* THANH TRÊN CÙNG — một đường kẻ của tờ sổ, không phải thẻ kính nổi.
 *
 * --header-h được ĐO từ header thật bằng ResizeObserver và ghi vào :root —
 * neo menu (scroll-margin-top) tính từ đó.
 *
 * Ở đầu trang: không viền, nền giấy hơi trong. Cuộn quá 8px: nền giấy +
 * đường kẻ 1px + làm mờ nhẹ phía sau. Chiều cao không đổi.
 *
 * MENU ĐIỆN THOẠI LÀ LỚP PHỦ (absolute), không nằm trong luồng trang.
 * Bản trước nó nằm trong luồng: mở ra là đẩy cả trang xuống ~375px, trình
 * duyệt tính điểm dừng lúc menu còn mở, menu đóng thì trang dịch ngược lên
 * — đo được heading bị che -298px ở MỌI mục. Nay bấm một mục: chặn nhảy
 * mặc định → đóng menu → đợi đóng xong → mới cuộn tới section.
 *
 * Menu máy tính có bảy mục, ở bề ngang 1120px thì chật. Hai mục ít dùng
 * nhất (出力ファイル, 精度) ẩn dưới 1200px thay vì cắt chữ; nút son luôn còn.
 *
 * Điện thoại: đúng MỘT nút menu, ở bên phải, có chữ. Dấu thương hiệu bên
 * trái có ba vạch trắng trông giống biểu tượng menu — nên nút menu phải
 * có chữ「メニュー」để không ai nhầm hai thứ với nhau.
 */
export function SiteHeader() {
  const { t, lang, setLang } = useI18n()
  const [mo, setMo] = useState(false)
  const [daCuon, setDaCuon] = useState(false)
  const [hienDock, setHienDock] = useState(false)
  const khung = useRef<HTMLElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Đo chiều cao header thật → --header-h (khác nhau giữa điện thoại / máy tính)
  useEffect(() => {
    const el = khung.current
    if (!el) return
    const ghi = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    ghi()
    if (!('ResizeObserver' in window)) return
    const ro = new ResizeObserver(ghi)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* Bấm một mục trong menu điện thoại: đóng trước, cuộn sau. */
  const toiMuc = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const dich = document.getElementById(href.slice(1))
    if (!dich) return
    e.preventDefault()
    setMo(false)
    const it = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let daCuon = false
    const cuon = () => {
      if (daCuon) return
      daCuon = true
      dich.scrollIntoView({ behavior: it ? 'auto' : 'smooth', block: 'start' })
      history.replaceState(null, '', href)
    }
    const p = panel.current
    if (p && !it) {
      p.addEventListener('transitionend', cuon, { once: true })
      setTimeout(cuon, 260) // phòng khi transitionend không tới
    } else {
      cuon()
    }
  }

  useEffect(() => {
    const doi = () => setDaCuon(window.scrollY > 8)
    doi()
    window.addEventListener('scroll', doi, { passive: true })
    return () => window.removeEventListener('scroll', doi)
  }, [])

  // Đóng menu khi màn hình rộng ra, hoặc khi bấm Escape
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const dong = () => mq.matches && setMo(false)
    const phim = (e: KeyboardEvent) => e.key === 'Escape' && setMo(false)
    mq.addEventListener('change', dong)
    window.addEventListener('keydown', phim)
    return () => {
      mq.removeEventListener('change', dong)
      window.removeEventListener('keydown', phim)
    }
  }, [])

  /* Thanh CTA đáy: chỉ hiện khi đã cuộn KHỎI hero, và ẩn lại khi khối
     lời mời cuối trang vào khung nhìn (ở đó đã có nút rồi). */
  useEffect(() => {
    const hero = document.getElementById('top')
    const cuoi = document.getElementById('start')
    if (!hero || !('IntersectionObserver' in window)) return
    let heroTrong = true
    let cuoiTrong = false
    const capNhat = () => setHienDock(!heroTrong && !cuoiTrong)
    const io = new IntersectionObserver((muc) => {
      for (const m of muc) {
        if (m.target === hero) heroTrong = m.isIntersecting
        if (m.target === cuoi) cuoiTrong = m.isIntersecting
      }
      capNhat()
    })
    io.observe(hero)
    if (cuoi) io.observe(cuoi)
    return () => io.disconnect()
  }, [])

  const muc = [
    { href: '#how', label: t.nav.how, phu: false },
    { href: '#screen', label: t.nav.screen, phu: false },
    { href: '#reads', label: t.nav.reads, phu: false },
    { href: '#verify', label: t.nav.verify, phu: false },
    { href: '#output', label: t.nav.output, phu: true },
    { href: '#limits', label: t.nav.limits, phu: true },
    { href: '#pricing', label: t.nav.pricing, phu: false },
    { href: '#faq', label: t.nav.faq, phu: true },
  ]

  return (
    <>
      <a href="#main-content" className="skip-link">{lang === 'jp' ? '本文へ移動' : lang === 'vn' ? 'Đến nội dung chính' : 'Skip to content'}</a>
      <header
        ref={khung}
        className={`sticky top-0 z-[60] border-b transition-[background-color,border-color] duration-200 ${
          daCuon || mo
            ? 'border-rule bg-paper/92 backdrop-blur-[6px]'
            : 'border-transparent bg-paper/90'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <a href="#top" className="shrink-0 text-[16px] text-sumi sm:text-[18px]">
            <Brand size={22} />
          </a>

          <nav
            aria-label={t.nav.menu}
            className="ml-auto hidden items-center gap-5 whitespace-nowrap lg:flex"
          >
            {muc.map((m) => (
              <a
                key={m.href}
                href={m.href}
                className={`nav-link text-[13.5px] ${m.phu ? 'hidden' : ''}`}
              >
                {m.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
            <div
              role="group"
              aria-label={t.footer.langLabel}
              className="mr-1 hidden overflow-hidden rounded-sm border border-rule min-[560px]:flex"
            >
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`px-2 py-1 text-[11px] font-medium transition-colors duration-200 ${
                    lang === l.code
                      ? 'bg-sumi text-paper'
                      : 'bg-paper-3 text-sumi-2 hover:bg-paper-2 hover:text-sumi'
                  }`}
                >
                  {l.short}
                </button>
              ))}
            </div>

            <a
              href={DASHBOARD_URL}
              className="nav-link hidden rounded-sm px-3 py-1.5 text-[13px] whitespace-nowrap min-[560px]:inline-block"
            >
              {t.nav.login}
            </a>
            <a
              href={DASHBOARD_URL}
              className="btn-shu hidden rounded-sm px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap min-[560px]:inline-block"
            >
              {t.nav.start}
            </a>

            <button
              type="button"
              onClick={() => setMo((v) => !v)}
              aria-expanded={mo}
              aria-controls="menu-dien-thoai"
              className="ml-1 flex h-9 items-center gap-2 rounded-sm border border-rule bg-paper-3 px-3 text-[12.5px] text-sumi transition-colors duration-200 hover:bg-paper-2 lg:hidden"
            >
              <span>{t.nav.menu}</span>
              <span aria-hidden className="relative block h-2.5 w-3.5">
                <span
                  className={`absolute inset-x-0 h-px bg-current transition-transform duration-200 ${
                    mo ? 'top-1/2 rotate-45' : 'top-0'
                  }`}
                />
                <span
                  className={`absolute inset-x-0 h-px bg-current transition-transform duration-200 ${
                    mo ? 'top-1/2 -rotate-45' : 'bottom-0'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        <div
          id="menu-dien-thoai"
          ref={panel}
          className="menu-panel absolute inset-x-0 top-full lg:hidden"
          data-open={mo}
        >
          <div inert={!mo}>
            <nav
              aria-label={t.nav.menu}
              className="max-h-[calc(100dvh-var(--header-h))] overflow-y-auto border-y border-rule bg-paper-3 shadow-[0_18px_30px_-22px_rgba(24,32,26,0.45)]"
            >
              {muc.map((m) => (
                <a
                  key={m.href}
                  href={m.href}
                  onClick={(e) => toiMuc(e, m.href)}
                  className="nav-link block border-b border-rule-soft px-4 py-3 text-[14px] hover:bg-paper-2 sm:px-6"
                >
                  {m.label}
                </a>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 min-[560px]:hidden sm:px-6">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    aria-pressed={lang === l.code}
                    className={`py-1 text-[13.5px] ${
                      lang === l.code ? 'font-medium text-sumi' : 'nav-link'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
                <a href={DASHBOARD_URL} className="nav-link ml-auto text-[13.5px]">
                  {t.nav.login}
                </a>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* CTA dính đáy — chỉ điện thoại, chỉ sau khi đã cuộn khỏi hero */}
      <div
        inert={!hienDock}
        aria-hidden={!hienDock}
        className={`cta-dock fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] min-[560px]:hidden ${
          hienDock ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <a
          href={DASHBOARD_URL}
          className="btn-shu block rounded-sm px-4 py-2.5 text-center text-[14.5px] font-medium"
        >
          {t.nav.start}
        </a>
      </div>
    </>
  )
}
