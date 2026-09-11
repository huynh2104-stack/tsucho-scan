'use client'

import { useI18n } from '@/lib/i18n'
import { SAMPLE_ROWS, yen } from '@/lib/sample-data'

/* FILE EXCEL NHẬN ĐƯỢC — dựng lại đúng cấu trúc `export.py` sinh ra, để
 * người xem biết chính xác thứ mình cầm về chứ không phải đoán.
 *
 * Ba thứ trong file mà chỉ nhìn ảnh chụp màn hình ứng dụng sẽ không thấy:
 *   1. Hàng「検証」ghi mức kiểm chứng ngay trong file
 *   2. Ô vàng đánh dấu chỗ máy không chắc, giữ nguyên khi mở bằng Excel
 *   3. Dòng ghi chú để trống ô tiền nên hàm SUM không bị sai
 *
 * Dựng bằng HTML chứ không chụp ảnh: chữ nét ở mọi độ phân giải, đổi ngôn
 * ngữ là đổi theo, và không tốn một tấm ảnh nào để tải.
 */
const COT = ['A', 'B', 'C', 'D', 'E']

export function ExcelPreview() {
  const { t } = useI18n()
  const e = t.excel
  const hang = SAMPLE_ROWS.slice(0, 6)

  return (
    <div className="overflow-hidden rounded-sm border border-rule bg-white shadow-[0_18px_40px_-24px_rgba(24,32,26,0.45)]">
      {/* Thanh ô đang chọn, như trên Excel thật */}
      <div className="flex items-center gap-2 border-b border-rule bg-[#f3f4f1] px-2 py-1.5">
        <span className="tnum rounded-[2px] border border-rule bg-white px-2 py-0.5 text-[10.5px] text-sumi-2">
          E2
        </span>
        <span className="text-[10.5px] text-sumi-3">{e.formulaBar}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left">
          <thead>
            <tr className="bg-[#f3f4f1] text-[10px] text-sumi-3">
              <th scope="col" className="w-8 border-b border-r border-rule py-1 text-center font-normal" />
              {COT.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="tnum border-b border-r border-rule py-1 text-center font-normal last:border-r-0"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[11.5px]">
            <O so={1} nhan={e.bankLabel} gopPhai={e.bankValue} />
            {/* Mức kiểm chứng nằm NGAY TRONG file, không phải chỉ trên web */}
            <O so={2} nhan={e.verifyLabel} gopPhai={e.verifyValue} dam />
            <O so={3} trong />

            <tr className="bg-[#eef0ea] text-[10.5px] font-medium text-sumi">
              <Stt so={4} />
              <td className="border-b border-r border-rule px-2 py-[5px]">{e.colDate}</td>
              <td className="border-b border-r border-rule px-2 py-[5px]">{e.colDesc}</td>
              <td className="border-b border-r border-rule px-2 py-[5px] text-right">{e.colOut}</td>
              <td className="border-b border-r border-rule px-2 py-[5px] text-right">{e.colIn}</td>
              <td className="border-b border-rule px-2 py-[5px] text-right">{e.colBal}</td>
            </tr>

            {hang.map((r, i) => (
              <tr key={r.no}>
                <Stt so={5 + i} />
                <td className="tnum border-b border-r border-rule px-2 py-[5px] whitespace-nowrap text-sumi">
                  {r.date}
                </td>
                <td className="truncate border-b border-r border-rule px-2 py-[5px] text-sumi">
                  {r.desc || r.payee}
                </td>
                <td className="tnum border-b border-r border-rule px-2 py-[5px] text-right whitespace-nowrap text-sumi">
                  {yen(r.out)}
                </td>
                <td className="tnum border-b border-r border-rule px-2 py-[5px] text-right whitespace-nowrap text-sumi">
                  {yen(r.in)}
                </td>
                {/* Ô vàng đi theo file, mở bằng Excel vẫn còn nguyên màu */}
                <td
                  className={`tnum border-b border-rule px-2 py-[5px] text-right whitespace-nowrap text-sumi ${
                    i === 2 ? 'bg-kin-soft ring-1 ring-inset ring-kin' : ''
                  }`}
                >
                  {yen(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Thẻ tên sheet dưới đáy — dấu hiệu ai cũng nhận ra là Excel */}
      <div className="flex items-center gap-1 border-t border-rule bg-[#f3f4f1] px-2 py-1">
        <span className="rounded-t-[2px] border-x border-t border-rule bg-white px-2.5 py-1 text-[10.5px] font-medium text-sumi">
          {e.sheetName}
        </span>
        <span className="px-2 py-1 text-[10.5px] text-sumi-3">{e.sheetName2}</span>
      </div>
    </div>
  )
}

function Stt({ so }: { so: number }) {
  return (
    <th
      scope="row"
      className="tnum w-8 border-b border-r border-rule bg-[#f3f4f1] py-[5px] text-center text-[10px] font-normal text-sumi-3"
    >
      {so}
    </th>
  )
}

/** Một hàng đầu file: nhãn ở cột A, giá trị gộp các cột còn lại. */
function O({
  so,
  nhan,
  gopPhai,
  dam,
  trong,
}: {
  so: number
  nhan?: string
  gopPhai?: string
  dam?: boolean
  trong?: boolean
}) {
  return (
    <tr>
      <Stt so={so} />
      {trong ? (
        <td colSpan={5} className="border-b border-rule px-2 py-[5px]">
          &nbsp;
        </td>
      ) : (
        <>
          <td className="border-b border-r border-rule px-2 py-[5px] text-[10.5px] text-sumi-3">
            {nhan}
          </td>
          <td
            colSpan={4}
            className={`border-b border-rule px-2 py-[5px] text-sumi ${dam ? 'font-semibold' : ''}`}
          >
            {gopPhai}
          </td>
        </>
      )}
    </tr>
  )
}
