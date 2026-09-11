/* Dữ liệu mẫu lấy từ một mặt sổ THẬT đã quét trong lúc phát triển
 * (một mặt 普通預金, trang 2). Giữ nguyên số thật vì chuỗi số dư phải
 * cộng trừ đúng — trang chủ trình bày chính cơ chế kiểm chứng đó, mà bịa
 * số thì phép tính hiện ngay trên màn hình sẽ sai.
 *
 * Đã kiểm: 25.024 − 1.100 = 23.924 → +58.300 = 82.224 → +290.950 = 373.174
 *          → −350.000 = 23.174 → +4.224.150 = 4.247.324 → −3.700.000
 *          = 547.324 → −2.835 = 544.489 → (dòng ghi tay, không đổi số dư)
 */

export type Row = {
  /** Số thứ tự in mờ ở lề trái cuốn sổ */
  no: string
  date: string
  /** Ký hiệu loại giao dịch in trên sổ (K/L/Q/R…) */
  kind: string
  desc: string
  /** Chữ katakana in chữ TO như trên sổ, cố ý không sửa thành chữ nhỏ */
  payee?: string
  out?: number
  in?: number
  balance: number
  /** Dòng VIẾT TAY của nhân viên ngân hàng, không phải chữ in máy */
  hand?: boolean
  /** Dòng ghi chú, không phải giao dịch — ô tiền để trống, tổng không đổi */
  note?: boolean
}

export const SAMPLE_ROWS: Row[] = [
  { no: '01', date: '07-03-21', kind: 'R', desc: '', payee: 'サリユスクエアカイヒ', out: 2750, balance: 25024 },
  { no: '02', date: '07-03-21', kind: 'R', desc: '手数料', payee: 'サリユステーシヨン', out: 1100, balance: 23924 },
  { no: '03', date: '07-03-31', kind: 'L', desc: '振込２', payee: 'カ）ヨンデンコウ', in: 58300, balance: 82224 },
  { no: '04', date: '07-03-31', kind: 'K', desc: '', payee: '松下水道', in: 290950, balance: 373174 },
  { no: '05', date: '07-03-31', kind: 'Q', desc: '', out: 350000, balance: 23174 },
  { no: '06', date: '07-04-01', kind: 'L', desc: '振込１', payee: 'カ）トクシマセツケイコウ', in: 4224150, balance: 4247324 },
  { no: '07', date: '07-04-01', kind: 'Q', desc: '', out: 3700000, balance: 547324 },
  { no: '08', date: '07-04-01', kind: 'R', desc: 'ご融資利息', out: 2835, balance: 544489 },
  /* Dòng cuối cùng của cuốn sổ do nhân viên VIẾT TAY. Đây là ca khó thật:
     chữ tay, không có số tiền, và không phải giao dịch — máy phải nhận ra
     cả ba điều đó thì tổng mới không sai. */
  { no: '09', date: '07-04-10', kind: '', desc: '新通帳に繰越', hand: true, note: true, balance: 544489 },
]

export const yen = (n?: number) => (n === undefined ? '' : n.toLocaleString('ja-JP'))
