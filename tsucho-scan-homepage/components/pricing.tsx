'use client'

import { Item, NHIP, Reveal } from '@/lib/motion'
import { useI18n } from '@/lib/i18n'

/* BẢNG GIÁ — kẻ theo lối cuốn sổ: cột là gói, dòng là khoản mục, số dùng
 * chữ đánh máy đều để thẳng cột.
 *
 * Mọi gói đều đủ tính năng; chỉ khác số mặt/tháng và thời gian giữ file.
 *
 * Nhấn cột giữa bằng ĐÚNG hai thứ: một viền son 1px bao quanh cả cột, và
 * con dấu nhỏ「ふつうはこれ」. Không nền đậm, không phát sáng.
 *
 * Nhãn「準備中・予定価格」vẫn đứng cạnh tiêu đề — giá chưa chốt thì phải
 * nói — nhưng thu nhỏ để không lấn át ba cột giá.
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

  /* Viền son quanh cột giữa, dựng từ bóng đổ trong từng ô: bảng kẻ dòng
     dùng border-collapse nên không bọc được một cột bằng border thường. */
  const vien = (vtri: 'dau' | 'giua' | 'cuoi') =>
    vtri === 'dau'
      ? 'shadow-[inset_1px_0_0_var(--shu),inset_-1px_0_0_var(--shu),inset_0_1px_0_var(--shu)]'
      : vtri === 'cuoi'
        ? 'shadow-[inset_1px_0_0_var(--shu),inset_-1px_0_0_var(--shu),inset_0_-1px_0_var(--shu)]'
        : 'shadow-[inset_1px_0_0_var(--shu),inset_-1px_0_0_var(--shu)]'

  return (
    <section id="pricing" className="border-t border-rule bg-paper-3">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="border-l-2 border-beni pl-4 sm:pl-6">
          <h2 className="max-w-[26ch] font-display text-[26px] leading-[1.3] font-semibold text-sumi sm:text-[34px]">
            {p.title}
          </h2>
          <span className="mt-2 inline-block rounded-[2px] border border-kin/70 bg-kin-soft/70 px-1.5 py-px text-[10.5px] whitespace-nowrap text-sumi-2">
            {p.badge}
          </span>
          <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.75] text-sumi-2">{p.lead}</p>
        </div>

        {/* ── Màn hình rộng: một bảng kẻ dòng ── */}
        <Reveal className="mt-12 hidden md:block">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[14rem]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <td />
                {p.plans.map((g, k) => (
                  <th
                    key={g.name}
                    scope="col"
                    className={`relative border-b-2 border-sumi px-4 pt-5 pb-3 align-bottom ${
                      k === 1 ? vien('dau') : ''
                    }`}
                  >
                    {k === 1 && (
                      <span className="seal absolute -top-2.5 left-4 bg-paper-3 px-1.5 py-px text-[10px] font-medium">
                        {p.best}
                      </span>
                    )}
                    <span className="block font-display text-[16px] font-semibold text-sumi">
                      {g.name}
                    </span>
                    <span className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="tnum text-[30px] leading-none font-semibold text-sumi">
                        {g.price}
                      </span>
                      <span className="text-[11.5px] font-normal text-sumi-2">{p.rowPrice}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dong.map((d, r) => (
                <tr key={d.nhan} className="border-b border-rule">
                  <th
                    scope="row"
                    className="py-3.5 pr-4 align-top text-[13.5px] font-medium text-sumi-2"
                  >
                    {d.nhan}
                  </th>
                  {p.plans.map((g, k) => (
                    <td
                      key={g.name}
                      className={`px-4 py-3.5 align-top ${
                        k === 1 ? vien(r === dong.length - 1 ? 'cuoi' : 'giua') : ''
                      } ${
                        d.nho
                          ? 'text-[13px] leading-relaxed text-sumi-2'
                          : 'tnum text-[14.5px] text-sumi'
                      }`}
                    >
                      {d.lay(k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>

        {/* ── Màn hình hẹp: ba khối xếp dọc, cùng nội dung ── */}
        <ul className="m-0 mt-10 grid list-none gap-3 p-0 md:hidden">
          {p.plans.map((g, k) => (
            <Item
              key={g.name}
              tre={k * NHIP}
              className={`relative rounded-[2px] border px-4 py-5 ${
                k === 1 ? 'border-shu' : 'border-rule'
              }`}
            >
              {k === 1 && (
                <span className="seal absolute -top-2.5 right-4 bg-paper-3 px-1.5 py-px text-[10px] font-medium">
                  {p.best}
                </span>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-[16px] font-semibold text-sumi">{g.name}</h3>
                <span className="flex items-baseline gap-1.5">
                  <span className="tnum text-[26px] leading-none font-semibold text-sumi">
                    {g.price}
                  </span>
                  <span className="text-[11px] text-sumi-2">{p.rowPrice}</span>
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-sumi-2">{g.who}</p>
              <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-rule-soft pt-3">
                {[
                  [p.rowPages, g.pages],
                  [p.rowPer, g.per],
                  [p.rowKeep, g.keep],
                  [p.rowFeat, p.featAll],
                ].map(([nhan, gt]) => (
                  <div key={nhan} className="contents">
                    <dt className="text-[12.5px] text-sumi-2">{nhan}</dt>
                    <dd className="tnum m-0 text-right text-[13.5px] text-sumi">{gt}</dd>
                  </div>
                ))}
              </dl>
            </Item>
          ))}
        </ul>

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

          <Reveal delay={NHIP} className="self-start border-l-2 border-kin bg-paper px-4 py-4 sm:pl-6">
            <p className="m-0 max-w-[54ch] text-[13.5px] leading-[1.8] text-sumi-2">{p.note}</p>
            <p className="m-0 mt-3 max-w-[54ch] text-[13.5px] leading-[1.8] text-sumi-2">{p.ask}</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
