'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { SAMPLE_ROWS, yen } from '@/lib/sample-data'

/* CUỐN SỔ MỞ RA — vật thể nằm trên mặt bàn.
 *
 *   trang TRÁI  = tờ giấy thật: khung in MỰC HỒNG của biểu mẫu, dữ liệu in
 *                 MỰC ĐEN của máy in kim, dòng cuối VIẾT TAY bằng bút
 *   gáy sổ      = chỗ gấp, tối lại ở giữa
 *   trang PHẢI  = bảng đọc ra
 *
 * BA ĐIỀU ĐÃ SỬA SAU KHI NGƯỜI DÙNG BÁO:
 *
 * 1. KHÔNG xoay khối này nữa. Xoay một lớp có chữ thì trình duyệt phải dựng
 *    lại nó thành ảnh và TẮT khử răng cưa theo điểm phụ — chữ nhoè hẳn trên
 *    màn hình thường. Cảm giác vật thể lấy từ bóng đổ là đủ.
 * 2. KHÔNG phủ vân giấy lên chữ. Vân chỉ nằm ở mặt bàn, nơi không có chữ.
 * 3. Màn hình hẹp thì XẾP CHỒNG hai trang chứ không đặt cạnh nhau. Đặt cạnh
 *    nhau trên điện thoại là buộc kéo ngang mới thấy hết — người dùng tưởng
 *    trang hỏng. Xếp chồng vẫn là một cuốn sổ, chỉ là gấp lại.
 */
const DELAY_DAU = 380
const NHIP = 115

export function PassbookSpread() {
  const { t } = useI18n()
  const h = t.hero

  /* Trạng thái đầu phải GIỐNG HỆT thứ máy chủ dựng ra: 0 dòng, chưa xong,
   * chưa chọn. Bản trước hỏi `window.matchMedia` ngay trong lúc dựng để
   * đặt trạng thái đầu — trên máy chủ không có `window` nên ra một đằng,
   * trên máy người dùng đang bật "giảm chuyển động" thì ra một nẻo, và
   * React báo lỗi hydration rồi dựng lại cả nhánh này.
   *
   * Nay chỉ hỏi BÊN TRONG effect, tức là sau khi đã khớp xong. Ai bật
   * giảm chuyển động thì nhảy thẳng tới trạng thái cuối, không chạy đếm. */
  const [daDoc, setDaDoc] = useState(0)
  const [xong, setXong] = useState(false)
  const [chon, setChon] = useState<number | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDaDoc(SAMPLE_ROWS.length)
      setXong(true)
      setChon(2)
      return
    }
    let i = 0
    const batDau = setTimeout(() => {
      const nhip = setInterval(() => {
        i += 1
        setDaDoc(i)
        if (i >= SAMPLE_ROWS.length) {
          clearInterval(nhip)
          setTimeout(() => {
            setXong(true)
            setChon(2)
          }, 260)
        }
      }, NHIP)
    }, DELAY_DAU)
    return () => clearTimeout(batDau)
  }, [])

  /* Rê chuột (hoặc dùng phím Tab) lên một hàng thì xem trước hàng đó; bấm
     thì chọn hẳn. Chỉ có hiệu lực sau khi máy đã đọc xong. */
  const [ro, setRo] = useState<number | null>(null)
  const dongTo = xong ? (ro ?? chon) : daDoc - 1

  /* VỆT SON TRƯỢT. Đo vị trí từng hàng trên trang giấy rồi dịch MỘT vệt
     tới đó bằng transform — không bật tắt lớp trên từng hàng, nên vệt
     trượt liền một mạch thay vì nhảy cóc. Hàng viết tay cao hơn các hàng
     khác, nên phải đo chứ không nhân chiều cao cố định. */
  const hangRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [vet, setVet] = useState<{ top: number; h: number } | null>(null)
  const [, doDoLai] = useState(0)

  // Đổi bề ngang cửa sổ thì hàng xuống dòng khác đi — đo lại
  useEffect(() => {
    const doi = () => doDoLai((n) => n + 1)
    window.addEventListener('resize', doi)
    return () => window.removeEventListener('resize', doi)
  }, [])

  useLayoutEffect(() => {
    const i = xong ? dongTo : null
    const el = i == null ? null : hangRefs.current[i]
    if (!el) return
    const moi = { top: el.offsetTop, h: el.offsetHeight }
    setVet((cu) => (cu && cu.top === moi.top && cu.h === moi.h ? cu : moi))
  })

  // Chuỗi số dư ở đáy đi theo đúng hàng đang xem (kể cả khi chỉ rê chuột)
  const iChuoi = xong ? (dongTo ?? 0) : Math.max(0, daDoc - 1)
  const row = SAMPLE_ROWS[iChuoi]
  const truoc =
    iChuoi > 0 ? SAMPLE_ROWS[iChuoi - 1].balance : row.balance + (row.out ?? 0) - (row.in ?? 0)

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[3px] bg-paper-3 shadow-[0_2px_0_rgba(255,255,255,0.4)_inset,0_34px_60px_-20px_rgba(0,0,0,0.6),0_10px_20px_-12px_rgba(0,0,0,0.45)]">
        <div className="grid md:grid-cols-[minmax(0,1.08fr)_14px_minmax(0,1fr)]">
          {/* ══════════ TRANG TRÁI — tờ giấy in sẵn ══════════ */}
          <div className="relative bg-paper">
            <p className="m-0 border-b border-beni-soft px-3.5 pt-2.5 pb-1.5 font-display text-[11.5px] italic text-beni">
              {h.demoPrinted}
            </p>

            <div className="grid grid-cols-[1.9rem_4.4rem_minmax(0,1fr)] border-b border-beni-soft px-3.5 py-1 text-[10px] text-beni/85">
              <span>{h.col.no}</span>
              <span>{h.col.date}</span>
              <span>{h.col.desc}</span>
            </div>

            {SAMPLE_ROWS.map((r, i) => (
              <button
                key={r.no}
                ref={(el) => {
                  hangRefs.current[i] = el
                }}
                type="button"
                onClick={() => xong && setChon(i)}
                onPointerEnter={(e) => xong && e.pointerType === 'mouse' && setRo(i)}
                onPointerLeave={() => setRo(null)}
                onFocus={() => xong && setRo(i)}
                onBlur={() => setRo(null)}
                aria-pressed={xong && chon === i}
                className={`relative z-[1] grid w-full grid-cols-[1.9rem_4.4rem_minmax(0,1fr)] items-center border-b border-beni-soft/70 px-3.5 py-[9px] text-left last:border-0 focus-visible:outline-offset-[-2px] ${
                  xong ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className="tnum text-[10.5px] text-beni/80">{r.no}</span>
                {r.hand ? (
                  /* Dòng VIẾT TAY: chữ bút, mực xanh, hơi nghiêng và lệch
                     dòng — đúng kiểu ghi vội vào cuối cuốn sổ. */
                  <span className="col-span-2 -mt-0.5 font-hand text-[15px] leading-tight text-[#2f4272]">
                    <span className="mr-2 inline-block -rotate-1">{r.date}</span>
                    <span className="inline-block rotate-[0.7deg]">{r.desc}</span>
                  </span>
                ) : (
                  <>
                    <span className="tnum text-[12.5px] whitespace-nowrap text-sumi">{r.date}</span>
                    <span className="truncate text-[13px] text-sumi">
                      {r.kind && <span className="tnum mr-1.5 text-beni/80">{r.kind}</span>}
                      {r.desc}
                      {r.payee && <span className="ml-1.5 text-[11px] text-sumi-2">{r.payee}</span>}
                    </span>
                  </>
                )}
              </button>
            ))}

            {/* Vệt son: một phần tử duy nhất, dịch tới hàng đang chọn */}
            <div
              aria-hidden
              className="rowmark band-slide pointer-events-none absolute inset-x-0 top-0"
              style={{
                height: vet?.h ?? 0,
                transform: `translateY(${vet?.top ?? 0}px)`,
                opacity: xong && vet ? 1 : 0,
              }}
            />

            {/* Ai bật "giảm chuyển động" thì effect đặt `xong` ngay lập tức,
                nên vệt quét này tự khắc không hiện — không cần hỏi lại. */}
            {!xong && (
              <div
                aria-hidden
                className="sweep pointer-events-none absolute inset-x-0 h-[52px] transition-[top] duration-150 ease-linear"
                style={{ top: `${36 + Math.max(0, daDoc - 1) * 35}px` }}
              />
            )}
          </div>

          {/* ══════════ GÁY SỔ ══════════ */}
          <div aria-hidden className="gutter hidden md:block" />
          <div aria-hidden className="h-px bg-rule md:hidden" />

          {/* ══════════ TRANG PHẢI — bảng đọc ra ══════════ */}
          <div className="bg-paper-3">
            <p className="m-0 border-b border-rule px-3.5 pt-2.5 pb-1.5 font-display text-[11.5px] italic text-sumi-2">
              {h.demoRead}
            </p>

            <div className="grid grid-cols-3 border-b border-rule px-3.5 py-1 text-[10px] text-sumi-2">
              <span className="text-right">{h.col.out}</span>
              <span className="text-right">{h.col.in}</span>
              <span className="text-right">{h.col.bal}</span>
            </div>

            {SAMPLE_ROWS.map((r, i) => {
              const hien = i < daDoc
              return (
                <div
                  key={r.no}
                  onPointerEnter={(e) => xong && e.pointerType === 'mouse' && setRo(i)}
                  onPointerLeave={() => setRo(null)}
                  onClick={() => xong && setChon(i)}
                  className={`grid grid-cols-3 items-center border-b border-rule-soft px-3.5 py-[9px] transition-colors duration-200 last:border-0 ${
                    dongTo === i ? 'rowmark' : ''
                  } ${xong ? 'cursor-pointer' : ''}`}
                >
                  {!hien ? (
                    <>
                      <span aria-hidden className="ml-auto h-[2px] w-8 rounded bg-rule-soft" />
                      <span aria-hidden className="ml-auto h-[2px] w-8 rounded bg-rule-soft" />
                      <span aria-hidden className="ml-auto h-[2px] w-12 rounded bg-rule-soft" />
                    </>
                  ) : r.note ? (
                    /* Dòng ghi chú: ô tiền để TRỐNG — điền vào là tổng sai.
                       Chỉ giữ số dư và gắn nhãn cho người soát biết. */
                    <>
                      <span className="landed col-span-2 text-[11px] text-sumi-2">
                        <span className="mr-1.5 rounded-sm bg-kin-soft px-1.5 py-0.5 text-[10px] font-medium text-sumi ring-1 ring-kin">
                          {h.tagNote}
                        </span>
                        {r.desc}
                      </span>
                      <span className="tnum landed text-right text-[12.5px] font-semibold whitespace-nowrap text-sumi">
                        ＊{yen(r.balance)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tnum landed text-right text-[12.5px] whitespace-nowrap text-sumi">
                        {yen(r.out)}
                      </span>
                      <span className="tnum landed text-right text-[12.5px] whitespace-nowrap text-sumi">
                        {yen(r.in)}
                      </span>
                      <span className="tnum landed text-right text-[12.5px] font-semibold whitespace-nowrap text-sumi">
                        ＊{yen(r.balance)}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Chuỗi số dư — cộng dồn thật theo từng dòng vừa đọc */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule bg-paper-2 px-3.5 py-2.5">
          <span className="font-display text-[11.5px] italic text-sumi-2">{h.demoChain}</span>
          <span className="tnum text-[12px] whitespace-nowrap text-sumi">
            {yen(truoc)}
            <span className="mx-1.5 text-sumi-3">−</span>
            {yen(row.out ?? 0)}
            <span className="mx-1.5 text-sumi-3">+</span>
            {yen(row.in ?? 0)}
            <span className="mx-1.5 text-sumi-3">=</span>
            <span className="font-semibold">{yen(row.balance)}</span>
          </span>
          <span
            className={`seal ml-auto shrink-0 px-2 py-0.5 text-[10.5px] font-semibold ${
              xong ? 'stamp' : 'invisible'
            }`}
          >
            {h.demoSeal}
          </span>
        </div>
      </div>

      <figcaption className="mt-3 text-[12px] leading-relaxed text-paper/55">
        {h.demoHint}
      </figcaption>
    </figure>
  )
}
