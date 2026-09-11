'use client'

import { motion } from 'motion/react'
import { Reveal, TAM_NHIN, len, damNhip } from '@/lib/motion'
import { useI18n } from '@/lib/i18n'

/* BẢNG GIÁ.
 *
 * Cách làm mặc định là ba tấm thẻ bo góc, tấm giữa to hơn và có đổ bóng.
 * Trang này không có một tấm thẻ nào từ đầu đến cuối, nên thêm ba tấm ở
 * đây là gãy mạch. Bảng giá vẽ theo đúng lối cuốn sổ: LƯỚI KẺ DÒNG, cột
 * là gói, dòng là khoản mục, số dùng chữ đánh máy đều để thẳng cột —
 * y như trang 普通預金.
 *
 * Một điều về nội dung, quan trọng hơn cả hình thức: mọi gói ĐỀU CÓ ĐỦ
 * TÍNH NĂNG. Chỉ khác số mặt sổ mỗi tháng và thời gian giữ file. Vì
 * không có tính năng nào bị khoá sau bức tường giá, nên không phải bịa
 * ra tính năng để lấp cho đủ ba cột — và đó cũng là lời chào đúng với
 * một công cụ nhỏ: "cứ dùng thử đi".
 *
 * Dấu「準備中・予定価格」nằm ngay cạnh tiêu đề, không giấu ở chân trang.
 * Giá chưa chốt thì phải nói là chưa chốt.
 */
export function Pricing() {
  const { t } = useI18n()
  const p = t.pricing
  const dong = [
    { nhan: p.rowWho, lay: (k: number) => p.plans[k].who, nho: true },
    { nhan: p.rowPages, lay: (k: number) => p.plans[k].pages },
    { nhan: p.rowPer, lay: (k: number) => p.plans[k].per },
    { nhan: p.rowKeep, lay: (k: number) => p.plans[k].keep },
    { nhan: p.rowFeat, lay: () => p.featAll },
  ]

  return (
    <section id="pricing" className="scroll-mt-14 border-t border-rule bg-paper-3">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="border-l-2 border-beni pl-4 sm:pl-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="max-w-[26ch] font-display text-[26px] leading-[1.3] font-semibold text-sumi sm:text-[34px]">
              {p.title}
            </h2>
            <span className="rounded-sm border border-kin bg-kin-soft px-2.5 py-1 text-[12px] whitespace-nowrap text-sumi">
              {p.badge}
            </span>
          </div>
          <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.75] text-sumi-2">{p.lead}</p>
        </Reveal>

        {/* ── Màn hình rộng: một bảng kẻ dòng ── */}
        <motion.div
          initial="an"
          whileInView="hien"
          viewport={TAM_NHIN}
          variants={damNhip(0.09, 0.1)}
          className="mt-10 hidden md:block"
        >
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <td className="w-[15rem]" />
                {p.plans.map((g, k) => (
                  <motion.th
                    key={g.name}
                    data-motion
                    scope="col"
                    variants={len}
                    className={`relative border-b-2 border-sumi px-4 pb-3 align-bottom ${
                      k === 1 ? 'bg-paper' : ''
                    }`}
                  >
                    <span className="block font-display text-[16px] font-semibold text-sumi">
                      {g.name}
                    </span>
                    <span className="tnum mt-1 block text-[30px] leading-none font-semibold text-sumi">
                      {g.price}
                    </span>
                    <span className="mt-1 block text-[11.5px] font-normal text-sumi-3">
                      {p.rowPrice}
                    </span>
                    {k === 1 && <Dau text={p.best} />}
                  </motion.th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dong.map((d) => (
                <motion.tr key={d.nhan} data-motion variants={len} className="border-b border-rule">
                  <th
                    scope="row"
                    className="py-3.5 pr-4 align-top text-[13.5px] font-medium text-sumi-2"
                  >
                    {d.nhan}
                  </th>
                  {p.plans.map((g, k) => (
                    <td
                      key={g.name}
                      className={`px-4 py-3.5 align-top ${k === 1 ? 'bg-paper' : ''} ${
                        d.nho
                          ? 'text-[13px] leading-relaxed text-sumi-2'
                          : 'tnum text-[14.5px] text-sumi'
                      }`}
                    >
                      {d.lay(k)}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* ── Màn hình hẹp: ba khối xếp dọc, cùng nội dung ── */}
        <motion.ul
          initial="an"
          whileInView="hien"
          viewport={TAM_NHIN}
          variants={damNhip(0.1, 0.05)}
          className="m-0 mt-10 grid list-none gap-0 border-t border-rule p-0 md:hidden"
        >
          {p.plans.map((g, k) => (
            <motion.li
              key={g.name}
              data-motion
              variants={len}
              className={`relative border-b border-rule px-3 py-5 ${k === 1 ? 'bg-paper' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-[16px] font-semibold text-sumi">{g.name}</h3>
                <span className="tnum text-[26px] leading-none font-semibold text-sumi">
                  {g.price}
                  <span className="ml-1.5 text-[11px] font-normal text-sumi-3">{p.rowPrice}</span>
                </span>
              </div>
              {k === 1 && (
                <span className="seal mt-2 inline-block px-2 py-[3px] text-[10.5px]">{p.best}</span>
              )}
              <p className="mt-2 text-[13px] leading-relaxed text-sumi-2">{g.who}</p>
              <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-rule-soft pt-3">
                {[
                  [p.rowPages, g.pages],
                  [p.rowPer, g.per],
                  [p.rowKeep, g.keep],
                  [p.rowFeat, p.featAll],
                ].map(([nhan, gt]) => (
                  <div key={nhan} className="contents">
                    <dt className="text-[12.5px] text-sumi-3">{nhan}</dt>
                    <dd className="tnum m-0 text-right text-[13.5px] text-sumi">{gt}</dd>
                  </div>
                ))}
              </dl>
            </motion.li>
          ))}
        </motion.ul>

        {/* Cái gì cũng có trong mọi gói — nói riêng ra để không ai phải dò bảng */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <Reveal>
            <h3 className="font-display text-[16px] font-semibold text-sumi">{p.featTitle}</h3>
            <ul className="m-0 mt-3 grid list-none gap-0 border-t border-rule p-0 sm:grid-cols-2 lg:grid-cols-1">
              {p.feats.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 border-b border-rule py-2.5 text-[13.5px] leading-relaxed text-sumi-2"
                >
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-shu" />
                  {f}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.08} className="self-start border-l-2 border-kin bg-paper px-4 py-4 sm:pl-6">
            <p className="m-0 max-w-[54ch] text-[13.5px] leading-[1.8] text-sumi-2">{p.note}</p>
            <p className="m-0 mt-3 max-w-[54ch] text-[13.5px] leading-[1.8] text-sumi-2">{p.ask}</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** Con dấu đỏ đóng xuống cột giữa. Một điểm nhấn duy nhất của cả mục. */
function Dau({ text }: { text: string }) {
  return (
    <motion.span
      data-motion
      className="seal absolute -top-3 left-4 bg-paper-3 px-2 py-[3px] text-[10.5px] font-normal"
      variants={{
        an: { opacity: 0, scale: 1.7 },
        hien: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.42, ease: [0.34, 1.56, 0.64, 1], delay: 0.3 },
        },
      }}
    >
      {text}
    </motion.span>
  )
}
