'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { ExcelPreview } from '@/components/excel-preview'
import { Explain } from '@/components/explain'
import { HINH_READS, HINH_TOOLS } from '@/components/diagrams'
import { Laptop } from '@/components/laptop'
import { PassbookSpread } from '@/components/passbook-spread'
import { DASHBOARD_URL } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import { Item, List, Reveal, TAM_NHIN, damNhip, len } from '@/lib/motion'

/* Khung chung cho mọi phần.
 *
 *   1. NỀN đổi theo nhịp bốn mức (giấy → giấy đậm → giấy sáng → mặt bàn
 *      tối), nên hai phần cạnh nhau không bao giờ cùng một sắc độ.
 *   2. Mỗi tiêu đề có một VẠCH MỰC HỒNG dựng đứng bên trái — chính màu
 *      mực biểu mẫu của cuốn sổ. Vạch ấy TỰ KẺ XUỐNG khi cuộn tới, như
 *      một nét bút vạch ở lề trước khi viết. Đó là chuyển động chữ ký
 *      của trang: nó lặp ở mọi phần nên thành nhịp, và nó mang nghĩa
 *      "phần mới bắt đầu từ đây" chứ không phải hoa lá cành.
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
    <section id={id} className={`scroll-mt-14 border-t border-rule ${NEN[nen]}`}>
      <div className="relative mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <motion.div
          initial="an"
          whileInView="hien"
          viewport={TAM_NHIN}
          variants={damNhip(0.11)}
          className="relative pl-4 sm:pl-6"
        >
          <motion.span
            data-motion
            aria-hidden
            className="absolute top-0 left-0 h-full w-[2px] bg-beni"
            style={{ originY: 0 }}
            variants={{
              an: { scaleY: 0 },
              hien: { scaleY: 1, transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] } },
            }}
          />
          <motion.h2
            data-motion
            variants={len}
            className={`max-w-[26ch] font-display text-[26px] leading-[1.3] font-semibold sm:text-[34px] ${
              toi ? 'text-paper' : 'text-sumi'
            }`}
          >
            {title}
          </motion.h2>
          {lead && (
            <motion.p
              data-motion
              variants={len}
              className={`mt-3 max-w-[62ch] text-[14.5px] leading-[1.75] ${
                toi ? 'text-paper/70' : 'text-sumi-2'
              }`}
            >
              {lead}
            </motion.p>
          )}
        </motion.div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  )
}

/** Khung ảnh chụp màn hình thật. Viền kẻ như mọi thứ khác trên trang. */
function Anh({
  src,
  alt,
  className = '',
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <figure
      className={`m-0 overflow-hidden rounded-sm bg-paper-3 ring-1 ring-rule ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        width={880}
        height={660}
        sizes="(max-width: 640px) 92vw, 420px"
        className="block h-auto w-full"
      />
    </figure>
  )
}

export function Hero() {
  const { t } = useI18n()
  const h = t.hero
  const khung = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: khung, offset: ['start start', 'end start'] })
  /* Cuốn sổ chìm xuống chậm hơn chữ khi cuộn qua — chỉ 40px, đủ để thấy
     có chiều sâu, không đủ để thành trò. */
  const chim = useTransform(scrollYProgress, [0, 1], [0, 40])

  return (
    <section
      id="top"
      ref={khung}
      className="grain relative overflow-hidden bg-desk"
    >
      <div className="relative mx-auto grid max-w-[1120px] gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-16 lg:py-28">
        <div className="settle min-w-0">
          <h1 className="font-display text-[38px] leading-[1.14] font-semibold tracking-[-0.015em] text-paper sm:text-[54px] lg:text-[62px]">
            {h.title.split('\n').map((d, i) => (
              <span key={i} className="block">
                {d}
              </span>
            ))}
          </h1>

          <p className="mt-6 max-w-[52ch] text-[15px] leading-[1.85] text-paper/70">{h.lead}</p>

          <div className="mt-8 flex flex-col gap-2.5 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
            <motion.a
              href={DASHBOARD_URL}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0, scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="rounded-sm bg-shu px-5 py-2.5 text-center text-[14.5px] font-medium text-paper-3 hover:brightness-110"
            >
              {h.primary}
            </motion.a>
            <a
              href="#reads"
              className="rounded-sm border border-paper/25 px-5 py-2.5 text-center text-[14.5px] text-paper/85 hover:border-paper/50 hover:text-paper"
            >
              {h.secondary}
            </a>
          </div>

          <p className="mt-5 max-w-[46ch] text-[12.5px] leading-relaxed text-paper/45">{h.note}</p>
        </div>

        {/* Hai lớp, cố ý tách: lớp NGOÀI do Motion giữ để trôi theo cuộn,
            lớp TRONG là hoạt ảnh mở đầu bằng CSS. Gộp vào một thẻ thì hai
            bên cùng ghi `transform` và giành nhau — hoạt ảnh CSS thắng
            lúc đang chạy, rồi buông ra cho Motion, thành một cú giật. */}
        <motion.div style={{ y: chim }} className="min-w-0">
          <div className="settle">
            <PassbookSpread />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function Reads() {
  const { t } = useI18n()
  const r = t.reads

  return (
    <Section id="reads" title={r.title} lead={r.lead} nen="giayDam">
      {/* Mỗi mục một HÌNH VẼ của chính trang sổ. Hình tự diễn khi cuộn
          tới — cột đảo chỗ, vòng tròn tự khoanh — nên hiểu được cả khi
          chưa đọc chữ. */}
      <List className="m-0 grid list-none gap-x-8 gap-y-0 border-t border-rule p-0 md:grid-cols-2">
        {r.items.map((it, i) => {
          const Hinh = HINH_READS[i]
          return (
            <Item
              key={it.title}
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
                <p className="tnum mt-3 inline-block rounded-sm bg-paper-3 px-2.5 py-1.5 text-[12px] text-sumi ring-1 ring-rule">
                  {it.sample}
                </p>
              </div>
            </Item>
          )
        })}
      </List>
    </Section>
  )
}

/* PHÉP TÍNH BA DÒNG, chạy ra kết quả từng dòng một khi cuộn tới.
 *
 * Đây là ý cốt lõi của cả sản phẩm, mà trước đó chỉ có một dòng công
 * thức khô khốc. Cho ba dòng THẬT của sổ mẫu tự cộng ra trước mắt thì
 * người xem hiểu ngay "kiểm chứng" nghĩa là gì — nhanh hơn mọi đoạn văn.
 */
function ChuoiSoDu() {
  const { t } = useI18n()
  const v = t.verify
  const hang = [
    { truoc: '23,924', dau: '+', so: '58,300', ra: '82,224' },
    { truoc: '82,224', dau: '+', so: '290,950', ra: '373,174' },
    { truoc: '373,174', dau: '−', so: '350,000', ra: '23,174' },
  ]
  return (
    <motion.ul
      initial="an"
      whileInView="hien"
      viewport={TAM_NHIN}
      variants={damNhip(0.16, 0.15)}
      className="m-0 grid list-none gap-0 p-0"
    >
      {hang.map((h) => (
        <motion.li
          key={h.ra}
          data-motion
          variants={len}
          className="tnum flex items-center gap-2 border-b border-rule-soft py-2.5 text-[13px] last:border-0 sm:gap-3 sm:text-[15px]"
        >
          <span className="text-sumi-2">{h.truoc}</span>
          <span className="text-sumi-3">{h.dau}</span>
          <span className="text-sumi-2">{h.so}</span>
          <span className="text-sumi-3">=</span>
          <motion.span
            variants={{
              an: { opacity: 0, filter: 'blur(3px)' },
              hien: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.34, delay: 0.22 } },
            }}
            className="font-semibold text-sumi"
          >
            {h.ra}
          </motion.span>
          <motion.span
            variants={{
              an: { opacity: 0, scale: 0.6 },
              hien: {
                opacity: 1,
                scale: 1,
                transition: { duration: 0.3, delay: 0.42, ease: [0.34, 1.56, 0.64, 1] },
              },
            }}
            className="ml-auto text-[11px] text-shu"
          >
            {v.tick}
          </motion.span>
        </motion.li>
      ))}
    </motion.ul>
  )
}

export function Verify() {
  const { t } = useI18n()
  const v = t.verify

  return (
    <Section id="verify" title={v.title} lead={v.lead}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
        <Reveal className="border-y-2 border-sumi bg-paper-3">
          <p className="tnum m-0 max-w-[36ch] px-4 py-7 text-[15px] leading-[1.55] text-sumi sm:px-8 sm:py-10 sm:text-[20px] lg:max-w-none lg:text-[24px]">
            {v.formula}
            <Explain label={t.explains.chain.label}>
              <span className="block font-sans text-[12.5px] leading-relaxed text-sumi-2">
                {t.explains.chain.body}
              </span>
            </Explain>
          </p>
        </Reveal>

        <Reveal delay={0.08} className="rounded-sm bg-paper-3 px-4 py-4 ring-1 ring-rule sm:px-6">
          <p className="m-0 mb-2 text-[12.5px] text-sumi-3">{v.workedLabel}</p>
          <ChuoiSoDu />
        </Reveal>
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

        <Reveal delay={0.08}>
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

          <table className="mt-4 w-full border-collapse overflow-hidden rounded-sm text-left ring-1 ring-rule">
            <tbody className="bg-paper-3">
              <tr className="border-b border-rule-soft">
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                <td className="tnum py-2 pr-3 text-right text-[12.5px] text-sumi">547,324</td>
              </tr>
              <tr className="border-b border-rule-soft">
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                <td className="tnum bg-kin-soft py-2 pr-3 text-right text-[12.5px] font-semibold text-sumi ring-1 ring-inset ring-kin">
                  544,489
                </td>
              </tr>
              <tr>
                <td className="tnum py-2 pl-3 text-[12.5px] text-sumi-2">07-04-01</td>
                <td className="tnum py-2 pr-3 text-right text-[12.5px] text-sumi">541,654</td>
              </tr>
            </tbody>
          </table>
        </Reveal>
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
      <Laptop />
      <Reveal as="p" className="mt-8 text-center text-[12.5px] text-paper/50">
        {a.caption}
      </Reveal>
    </Section>
  )
}

/** Ảnh chụp thật cho từng bước. Thứ tự khớp với `how.steps`. */
const ANH_BUOC = [
  '/shots/step-1-import.webp',
  '/shots/step-2-straighten.webp',
  '/shots/step-3-scan.webp',
  '/shots/step-4-fix.webp',
  '/shots/step-5-export.webp',
]

export function How() {
  const { t } = useI18n()
  const h = t.how

  return (
    <Section id="how" title={h.title} lead={h.lead} nen="giayDam">
      {/* Số ở lề trái là số thứ tự 01–24 in mờ trên chính cuốn sổ, và ở
          đây nội dung ĐÚNG LÀ một trình tự nên con số có nghĩa thật.
          Mỗi bước kèm một ảnh chụp thật của đúng bước đó. */}
      <List as="ol" buoc={0.09} className="m-0 list-none border-t border-rule p-0">
        {h.steps.map((s, i) => (
          <Item key={s.title} className="border-b border-rule py-5 sm:py-7">
            <div className="flex items-baseline gap-3 sm:gap-5">
              <span className="tnum shrink-0 text-[12px] text-beni">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-[16.5px] font-semibold text-sumi">{s.title}</h3>
            </div>
            <div
              className={`mt-3 grid gap-4 sm:mt-4 sm:gap-8 sm:pl-[2rem] ${
                i % 2 === 0
                  ? 'sm:grid-cols-[24rem_minmax(0,1fr)]'
                  : 'sm:grid-cols-[minmax(0,1fr)_24rem]'
              }`}
            >
              <Anh
                src={ANH_BUOC[i]}
                alt={s.title}
                className={i % 2 === 0 ? '' : 'sm:order-2'}
              />
              <p className="m-0 max-w-[46ch] self-center text-[14px] leading-[1.85] text-sumi-2 sm:justify-self-center">
                {s.body}
              </p>
            </div>
          </Item>
        ))}
      </List>
    </Section>
  )
}

export function Tools() {
  const { t } = useI18n()
  const w = t.tools

  return (
    <Section title={w.title} lead={w.lead}>
      <List className="m-0 grid list-none gap-x-8 gap-y-0 border-t border-rule p-0 sm:grid-cols-2">
        {w.items.map((it, i) => {
          const Hinh = HINH_TOOLS[i]
          return (
            <Item
              key={it.title}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-5"
            >
              <figure className="m-0 self-start overflow-hidden rounded-sm">
                {Hinh && <Hinh />}
              </figure>
              <div className="min-w-0">
                <h3 className="font-display text-[16px] font-semibold text-sumi">{it.title}</h3>
                <p className="mt-1 max-w-[50ch] text-[13.5px] leading-[1.7] text-sumi-2">
                  {it.body}
                </p>
              </div>
            </Item>
          )
        })}
      </List>
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
        <List className="m-0 list-none border-t border-rule p-0">
          {e.points.map((p, i) => (
            <Item key={p.t} className="border-b border-rule py-4">
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
        </List>
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
          delay={0.08}
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
  const f = t.faq

  return (
    <Section id="faq" title={f.title}>
      <List as="div" className="border-t border-rule">
        {f.items.map((it) => (
          <motion.details key={it.q} data-motion variants={len} className="group border-b border-rule">
            <summary className="flex cursor-pointer list-none items-baseline gap-3 py-4 text-[14.5px] font-medium text-sumi marker:content-none">
              <span
                aria-hidden
                className="mt-[2px] shrink-0 text-[13px] text-shu transition-transform duration-200 group-open:rotate-45"
              >
                ＋
              </span>
              <span className="max-w-[58ch]">{it.q}</span>
            </summary>
            {/* Mở ra thì chữ trôi xuống. Làm bằng CSS gắn vào `details[open]`
                chứ không bằng Motion: thẻ đóng thì nội dung là `display:none`,
                nên hoạt ảnh của Motion chạy lúc dựng thẻ — tức là chạy vào
                lúc không ai thấy, rồi khi mở ra thì đã xong từ đời nào. */}
            <p className="faq-a m-0 max-w-[64ch] pb-5 pl-[1.6rem] text-[13.5px] leading-[1.8] text-sumi-2">
              {it.a}
            </p>
          </motion.details>
        ))}
      </List>
    </Section>
  )
}

export function Cta() {
  const { t } = useI18n()
  const c = t.cta

  return (
    <section className="border-t border-rule bg-sumi text-paper">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2 className="max-w-[24ch] font-display text-[26px] leading-[1.3] font-semibold sm:text-[34px]">
            {c.title}
          </h2>
          <p className="mt-3 max-w-[54ch] text-[14.5px] leading-[1.75] text-paper/70">{c.lead}</p>
          <motion.a
            href={DASHBOARD_URL}
            whileHover={{ y: -2 }}
            whileTap={{ y: 0, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="mt-8 inline-block rounded-sm bg-shu px-6 py-3 text-[15px] font-medium text-paper-3 hover:brightness-110"
          >
            {c.button}
          </motion.a>
          <p className="mt-3.5 text-[12.5px] text-paper/55">{c.note}</p>
        </Reveal>
      </div>
    </section>
  )
}
