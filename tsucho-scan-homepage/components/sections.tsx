'use client'

import { useRef } from 'react'
import { useInView } from 'motion/react'
import { ExcelPreview } from '@/components/excel-preview'
import { Explain } from '@/components/explain'
import { HINH_READS } from '@/components/diagrams'
import { Faq as DanhSachHoiDap } from '@/components/faq'
import { IntroVideo } from '@/components/intro-video'
import { ProductTour } from '@/components/product-tour'
import { ManHinh } from '@/components/man-hinh'
import { PassbookSpread } from '@/components/passbook-spread'
import { MOTION_TOOLS } from '@/components/tool-motion'
import { DASHBOARD_URL } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import { Item, NHIP, Reveal } from '@/lib/motion'

/* Khung chung cho mọi phần.
 *
 *   1. NỀN đổi theo nhịp bốn mức (giấy → giấy đậm → giấy sáng → mặt bàn
 *      tối), nên hai phần cạnh nhau không bao giờ cùng một sắc độ.
 *   2. Mỗi tiêu đề có một VẠCH MỰC HỒNG dựng đứng bên trái — màu mực biểu
 *      mẫu của cuốn sổ. Tiêu đề hiện ngay, không chuyển động.
 *
 * Neo menu không bị header che: `section[id]` có scroll-margin-top trong
 * globals.css, tính từ --header-h.
 */
type Nen = 'giay' | 'giayDam' | 'giaySang' | 'toi'

const NEN: Record<Nen, string> = {
  giay: 'bg-paper',
  giayDam: 'bg-paper-2',
  giaySang: 'bg-paper-3',
  toi: 'bg-desk grain relative overflow-hidden',
}

function Section({
  id,
  title,
  lead,
  children,
  nen = 'giay',
}: {
  id?: string
  title: string
  lead?: string
  children: React.ReactNode
  nen?: Nen
}) {
  const toi = nen === 'toi'
  return (
    <section id={id} className={`border-t border-rule ${NEN[nen]}`}>
      <div className="section-inner relative mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24">
        {/* Tiêu đề hiện NGAY, không chuyển động — chỉ phụ kiện bên dưới
            (thẻ, dòng số, con dấu) mới hiện dần. */}
        <div className="relative border-l-2 border-beni pl-4 sm:pl-6">
          <h2
            className={`max-w-[26ch] font-display text-[26px] leading-[1.3] font-semibold sm:text-[34px] ${
              toi ? 'text-paper' : 'text-sumi'
            }`}
          >
            {title}
          </h2>
          {lead && (
            <p
              className={`mt-3 max-w-[62ch] text-[14.5px] leading-[1.75] ${
                toi ? 'text-paper/75' : 'text-sumi-2'
              }`}
            >
              {lead}
            </p>
          )}
        </div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  )
}

export function Hero() {
  const { t, lang } = useI18n()
  const h = t.hero
  const intro = {
    jp: { label: '日本の通帳に、実務のための読み取りを。', demo: '操作の流れを見る', proof: ['写真・PDFから読み取り', '残高の整合性をチェック', 'Excel・CSVに書き出し'] },
    vn: { label: 'Từ sổ ngân hàng Nhật đến dữ liệu dùng được.', demo: 'Xem quy trình thao tác', proof: ['Đọc ảnh và PDF', 'Đối chiếu số dư từng dòng', 'Xuất Excel và CSV'] },
    en: { label: 'Japanese passbooks. Ready for real work.', demo: 'Explore the workflow', proof: ['Read photos and PDFs', 'Check running balances', 'Export Excel and CSV'] },
  }[lang]

  return (
    /* MẶT BÀN TỐI: cuốn sổ là tờ giấy SÁNG nằm trên mặt bàn SẪM.
       Toàn bộ tiêu đề + mô tả + hai nút + bảng mẫu nằm gọn trong một khung
       1440×900; chỉ dòng chú thích dưới bảng được phép tràn. */
    <section id="top" className="hero-section relative overflow-hidden bg-desk">
      <div className="hero-grid relative mx-auto grid max-w-[1200px] gap-10 px-4 pt-12 pb-14 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="hero-context">{intro.label}</p>
          <h1 className="hero-title font-display font-semibold text-paper">
            {h.title.split('\n').map((d, i) => (
              <span key={i} className="block">
                {d}
              </span>
            ))}
          </h1>

          <p className="mt-5 max-w-[52ch] text-[15px] leading-[1.8] text-paper/75">{h.lead}</p>

          <div className="mt-7 flex flex-col gap-2.5 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
            <a
              href={DASHBOARD_URL}
              className="btn-shu rounded-sm px-5 py-2.5 text-center text-[14.5px] font-medium"
            >
              {h.primary}
            </a>
            <a
              href="#how"
              className="rounded-sm border border-paper/25 px-5 py-2.5 text-center text-[14.5px] text-paper/85 transition-colors duration-200 hover:border-paper/55 hover:text-paper"
            >
              {intro.demo}
            </a>
          </div>

          <p className="mt-5 max-w-[46ch] text-[12.5px] leading-relaxed text-paper/55">{h.note}</p>
        </div>

        <div className="settle min-w-0" style={{ animationDelay: '120ms' }}>
          <PassbookSpread />
        </div>
      </div>
      <div className="hero-benefits">
        {intro.proof.map((label, i) => <a key={label} href={['#how', '#verify', '#output'][i]}><span aria-hidden="true">{['↳', '✓', '↗'][i]}</span>{label}</a>)}
      </div>
    </section>
  )
}

/* Đặt ngay sau phần đầu: người được gửi đường link thường chỉ xem đến
 * đây. Nền giấy thường vì phần đầu là mặt bàn tối, phần kế là giấy đậm. */
export function Video() {
  const { t } = useI18n()
  const v = t.video

  return (
    <Section id="video" title={v.title} lead={v.lead}>
      <IntroVideo />
    </Section>
  )
}

export function Reads() {
  const { t } = useI18n()
  const r = t.reads

  return (
    <Section id="reads" title={r.title} lead={r.lead} nen="giayDam">
      {/* Mỗi mục tự hiện khi lọt vào khung nhìn. Hai mục cùng hàng lệch
          nhau 50ms (trái trước, phải sau). Hình vẽ bên trong tự diễn theo
          mục của nó — cột đảo chỗ, vòng tròn tự khoanh — không co giãn. */}
      <ul className="m-0 grid list-none gap-x-8 gap-y-0 border-t border-rule p-0 md:grid-cols-2">
        {r.items.map((it, i) => {
          const Hinh = HINH_READS[i]
          return (
            <Item
              key={it.title}
              tre={(i % 2) * NHIP}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-5 sm:py-6"
            >
              <figure className="m-0 self-start overflow-hidden rounded-sm">
                {Hinh && <Hinh />}
              </figure>
              <div className="min-w-0">
                <h3 className="font-display text-[16.5px] font-semibold text-sumi">
                  {it.title}
                  {i === 2 && (
                    <Explain label={t.explains.kana.label}>
                      <span className="block text-[12.5px] leading-relaxed text-sumi-2">
                        {t.explains.kana.body}
                      </span>
                    </Explain>
                  )}
                  {i === 4 && (
                    <Explain label={t.explains.rowno.label}>
                      <span className="block text-[12.5px] leading-relaxed text-sumi-2">
                        {t.explains.rowno.body}
                      </span>
                    </Explain>
                  )}
                </h3>
                <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-[1.75] text-sumi-2">
                  {it.body}
                </p>
                <p className="tnum mt-3 inline-block max-w-full rounded-sm bg-paper-3 px-2.5 py-1.5 text-[12px] break-words text-sumi ring-1 ring-rule">
                  {it.sample}
                </p>
              </div>
            </Item>
          )
        })}
      </ul>
    </Section>
  )
}

/* 残高チェーン — chạy ĐÚNG MỘT LẦN khi khối này vào khung nhìn ~40%.
 *
 * Thứ tự là câu chuyện của sản phẩm: công thức hiện → ba dòng tính lần
 * lượt (cách nhau 90ms) → kết quả mỗi dòng "đáp xuống" (landed) → son
 * đóng「一致」nhỏ (stamp). Cuộn lên xuống không chạy lại.
 *
 * Dùng lại hai lớp CSS đã có: `.landed` và `.stamp`. Trước khi chạy, các
 * dòng chỉ ẩn bằng opacity nên bố cục không nhảy.
 */
function useChayMotLan<T extends Element>(amount: number) {
  const ref = useRef<T>(null)
  const chay = useInView(ref, { once: true, amount })
  return [ref, chay] as const
}

const BUOC_CHUOI = 0.09

function ChuoiSoDu({ chay }: { chay: boolean }) {
  const { t } = useI18n()
  const v = t.verify
  const hang = [
    { truoc: '23,924', dau: '+', so: '58,300', ra: '82,224' },
    { truoc: '82,224', dau: '+', so: '290,950', ra: '373,174' },
    { truoc: '373,174', dau: '−', so: '350,000', ra: '23,174' },
  ]
  return (
    <ul className="m-0 grid list-none gap-0 p-0">
      {hang.map((h, i) => {
        const tre = (i + 1) * BUOC_CHUOI
        return (
          <li
            key={h.ra}
            data-motion
            className={`tnum flex flex-wrap items-center gap-2 border-b border-rule-soft py-2.5 text-[13px] last:border-0 sm:gap-3 sm:text-[15px] ${
              chay ? 'settle' : 'opacity-0'
            }`}
            style={chay ? { animationDelay: `${tre}s` } : undefined}
          >
            <span className="text-sumi-2">{h.truoc}</span>
            <span className="text-sumi-3">{h.dau}</span>
            <span className="text-sumi-2">{h.so}</span>
            <span className="text-sumi-3">=</span>
            <span
              data-motion
              className={`font-semibold text-sumi ${chay ? 'landed' : 'opacity-0'}`}
              style={chay ? { animationDelay: `${tre + 0.22}s` } : undefined}
            >
              {h.ra}
            </span>
            <span
              data-motion
              className={`seal ml-auto px-1.5 py-px text-[10.5px] leading-tight font-medium ${
                chay ? 'stamp' : 'opacity-0'
              }`}
              style={chay ? { animationDelay: `${tre + 0.44}s` } : undefined}
            >
              {v.tick}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function Verify() {
  const { t } = useI18n()
  const v = t.verify
  const [khoiChuoi, chayChuoi] = useChayMotLan<HTMLDivElement>(0.4)
  const [khoiVang, chayVang] = useChayMotLan<HTMLTableElement>(0.6)

  return (
    <Section id="verify" title={v.title} lead={v.lead}>
      <div
        ref={khoiChuoi}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center"
      >
        <div
          data-motion
          className={`border-y-2 border-sumi bg-paper-3 ${chayChuoi ? 'settle' : 'opacity-0'}`}
        >
          <p className="tnum m-0 max-w-[36ch] px-4 py-7 text-[15px] leading-[1.55] text-sumi sm:px-8 sm:py-10 sm:text-[20px] lg:max-w-none lg:text-[24px]">
            {v.formula}
            <Explain label={t.explains.chain.label}>
              <span className="block font-sans text-[12.5px] leading-relaxed text-sumi-2">
                {t.explains.chain.body}
              </span>
            </Explain>
          </p>
        </div>

        <div className="rounded-sm bg-paper-3 px-4 py-4 ring-1 ring-rule sm:px-6">
          <p className="m-0 mb-2 text-[12.5px] text-sumi-2">{v.workedLabel}</p>
          <ChuoiSoDu chay={chayChuoi} />
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Reveal>
          <h3 className="font-display text-[17px] font-semibold text-sumi">{v.levelsTitle}</h3>
          <dl className="m-0 mt-4 border-t border-rule">
            {v.levels.map((l, i) => (
              <div
                key={l.label}
                className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-rule py-3"
              >
                <dt className="flex items-center">
                  <span
                    aria-hidden
                    className={`mt-[1px] inline-block h-2.5 w-2.5 rounded-full ${
                      i === 0 ? 'bg-shu' : i === 1 ? 'bg-kin' : 'bg-rule'
                    }`}
                  />
                </dt>
                <dd className="m-0">
                  <span className="text-[14px] font-medium text-sumi">{l.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-sumi-2">
                    {l.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* Cột「黄色は…」KHÔNG bọc trong khối hiện-dần: nó từng bị chụp lại
            khi còn đang mờ dở, trông như chữ nhạt. Chữ tối thiểu --sumi-2. */}
        <div>
          <h3 className="font-display text-[17px] font-semibold text-sumi">
            {v.yellowTitle}
            <Explain label={v.yellowExplainLabel}>
              <span className="block text-[12.5px] leading-relaxed text-sumi-2">
                {v.yellowExplain}
              </span>
            </Explain>
          </h3>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-[1.75] text-sumi-2">
            {v.yellowBody}
          </p>

          <table
            ref={khoiVang}
            className="mt-4 w-full border-collapse overflow-hidden rounded-sm text-left ring-1 ring-rule"
          >
            <tbody className="bg-paper-3">
              <tr className="border-b border-rule-soft">
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                <td className="tnum py-2 pr-3 text-right text-[12.5px] text-sumi">547,324</td>
              </tr>
              <tr className="border-b border-rule-soft">
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                {/* Ô SAI NGẢ VÀNG: đập một nhịp rồi đứng, chỉ một lần */}
                <td
                  className={`tnum bg-kin-soft py-2 pr-3 text-right text-[12.5px] font-semibold text-sumi ring-1 ring-kin ring-inset ${
                    chayVang ? 'kin-pulse' : ''
                  }`}
                >
                  544,489
                </td>
              </tr>
              <tr>
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                <td className="tnum py-2 pr-3 text-right text-[12.5px] text-sumi">541,654</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Reveal className="mt-12 border-l-2 border-shu bg-paper-3 px-4 py-4 sm:pl-6">
        <h3 className="font-display text-[16px] font-semibold text-sumi">{v.caveatTitle}</h3>
        <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-[1.75] text-sumi-2">
          {v.caveatBody}
        </p>
      </Reveal>
    </Section>
  )
}

export function Workspace() {
  const { t } = useI18n()
  const a = t.app

  return (
    <Section id="screen" title={a.title} lead={a.lead} nen="toi">
      <ManHinh />
      <p className="mt-8 text-center text-[12.5px] text-paper/60">{a.caption}</p>
    </Section>
  )
}

export function How() {
  const { t } = useI18n()
  const h = t.how

  return (
    <Section id="how" title={h.title} lead={h.lead} nen="giayDam">
      <ProductTour />
    </Section>
  )
}

export function Tools() {
  const { t } = useI18n()
  const w = t.tools

  return (
    <Section title={w.title} lead={w.lead}>
      {/* Mỗi thẻ một cảnh nhỏ diễn đúng thao tác của công cụ (tool-motion.tsx).
          Bốn cảnh lệch pha nhau 1,1 giây để không cùng lúc nhúc nhích. */}
      <ul className="m-0 grid list-none gap-x-10 gap-y-0 border-t border-rule p-0 md:grid-cols-2">
        {w.items.map((it, i) => {
          const Canh = MOTION_TOOLS[i]
          return (
            <Item
              key={it.title}
              tre={(i % 2) * NHIP}
              className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-5 border-b border-rule py-6 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-x-6"
            >
              <figure className="m-0 overflow-hidden rounded-[4px] ring-1 ring-rule-soft">
                {Canh && <Canh pha={i * 1.1} label={it.title} />}
              </figure>
              <div className="min-w-0">
                <h3 className="font-display text-[16.5px] font-semibold text-sumi">{it.title}</h3>
                <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-[1.75] text-sumi-2">
                  {it.body}
                </p>
              </div>
            </Item>
          )
        })}
      </ul>
    </Section>
  )
}

export function Excel() {
  const { t } = useI18n()
  const e = t.excel

  return (
    <Section id="output" title={e.title} lead={e.lead} nen="giaySang">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:items-start">
        <Reveal className="min-w-0">
          <ExcelPreview />
        </Reveal>
        <ul className="m-0 list-none border-t border-rule p-0">
          {e.points.map((p, i) => (
            <Item key={p.t} tre={i * NHIP} className="border-b border-rule py-4">
              <h3 className="font-display text-[15.5px] font-semibold text-sumi">
                {p.t}
                {i === 0 && (
                  <Explain label={t.explains.level.label}>
                    <span className="block text-[12.5px] leading-relaxed text-sumi-2">
                      {t.explains.level.body}
                    </span>
                    <span className="mt-2.5 block space-y-1.5">
                      {t.verify.levels.map((lv, k) => (
                        <span key={lv.label} className="flex items-start gap-2">
                          <span
                            className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${
                              k === 0 ? 'bg-shu' : k === 1 ? 'bg-kin' : 'bg-rule'
                            }`}
                          />
                          <span className="text-[12px] text-sumi">{lv.label}</span>
                        </span>
                      ))}
                    </span>
                  </Explain>
                )}
              </h3>
              <p className="mt-1 max-w-[46ch] text-[13px] leading-[1.7] text-sumi-2">{p.d}</p>
            </Item>
          ))}
        </ul>
      </div>
    </Section>
  )
}

export function Limits() {
  const { t } = useI18n()
  const l = t.limits

  return (
    <Section id="limits" title={l.title} lead={l.lead} nen="giayDam">
      <Reveal>
        <table className="w-full border-collapse text-left">
          <tbody className="border-t border-rule">
            {l.rows.map((r, i) => (
              <tr key={r.metric} className="border-b border-rule">
                <th
                  scope="row"
                  className="py-3.5 pr-4 align-baseline text-[14px] font-medium text-sumi"
                >
                  {r.metric}
                  {i === 1 && (
                    <Explain label={t.explains.katakana.label}>
                      <span className="block text-[12.5px] leading-relaxed text-sumi-2">
                        {t.explains.katakana.body}
                      </span>
                    </Explain>
                  )}
                  <span className="mt-1 block max-w-[24ch] text-[12px] leading-relaxed font-normal text-sumi-2 sm:hidden">
                    {r.note}
                  </span>
                </th>
                <td className="tnum py-3.5 align-baseline text-[15px] font-semibold whitespace-nowrap text-sumi sm:pr-6 sm:text-[16px]">
                  {r.value}
                </td>
                <td className="hidden py-3.5 align-baseline text-[13px] leading-relaxed text-sumi-2 sm:table-cell">
                  {r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Reveal>
          <h3 className="font-display text-[16px] font-semibold text-sumi">{l.notDoTitle}</h3>
          <ul className="m-0 mt-3 list-none border-t border-rule p-0">
            {l.notDo.map((d) => (
              <li
                key={d}
                className="border-b border-rule py-2.5 pl-5 text-[13.5px] leading-[1.7] text-sumi-2 before:mr-2 before:-ml-5 before:text-sumi-3 before:content-['×']"
              >
                {d}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal
          as="p"
          delay={NHIP}
          className="m-0 self-center font-display text-[18px] leading-[1.6] text-balance text-sumi italic sm:text-[21px]"
        >
          {l.value}
        </Reveal>
      </div>
    </Section>
  )
}

export function Faq() {
  const { t } = useI18n()

  return (
    <Section id="faq" title={t.faq.title}>
      <DanhSachHoiDap />
    </Section>
  )
}

export function Cta() {
  const { t } = useI18n()
  const c = t.cta

  return (
    <section id="start" className="border-t border-rule bg-sumi text-paper">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20">
        <div>
          <h2 className="max-w-[24ch] font-display text-[26px] leading-[1.3] font-semibold sm:text-[34px]">
            {c.title}
          </h2>
          <p className="mt-3 max-w-[54ch] text-[14.5px] leading-[1.75] text-paper/75">{c.lead}</p>
          <a
            href={DASHBOARD_URL}
            className="btn-shu mt-8 inline-block rounded-sm px-6 py-3 text-[15px] font-medium"
          >
            {c.button}
          </a>
        </div>
      </div>
    </section>
  )
}
