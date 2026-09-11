'use client'

import { motion } from 'motion/react'

/* ─────────────────────────────────────────────────────────────
   HÌNH VẼ NHỎ — mỗi mục một hình.

   Người dùng nói: chữ quá nhiều, thiếu hình. Cách làm dễ nhất là lấy
   một bộ biểu tượng có sẵn rồi dán lên mỗi tiêu đề — nhưng một cái
   biểu tượng "tài liệu" thì KHÔNG nói được gì về「ゆうちょは列が逆」.

   Nên đây không phải biểu tượng, mà là HÌNH VẼ THU NHỎ CỦA CHÍNH TRANG
   SỔ: đúng cái cột bị đảo, đúng cái vòng tròn quanh chữ số năm, đúng
   nếp gấp giữa hai trang. Nhìn hình là hiểu mục đó nói gì, không cần
   đọc hết chữ. Vẽ bằng đúng mực của trang: sumi, beni, shu.

   Mỗi hình TỰ DIỄN khi cuộn tới — hai cột đảo chỗ cho nhau, vòng tròn
   tự khoanh, nếp gấp quét ngang. Chuyển động ở đây mang nội dung chứ
   không trang trí; nó thay cho một câu giải thích.

   Hình nhận nhãn biến thể từ danh sách cha (`an` / `hien`) nên chúng
   chạy theo đúng nhịp của mục mình, không cần bộ theo dõi riêng.
   ───────────────────────────────────────────────────────────── */

function Svg({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 120 84" role="img" aria-label={label} className="h-auto w-full">
      {children}
    </svg>
  )
}

/** Nền trang giấy chung cho phần lớn hình. */
function Giay() {
  return (
    <rect
      x="6"
      y="8"
      width="108"
      height="68"
      rx="2"
      fill="var(--paper-3)"
      stroke="var(--rule)"
      strokeWidth="1"
    />
  )
}

const keO = { duration: 0.7, ease: [0.22, 1, 0.36, 1] } as const

/* 1 ── Cột お預り／お支払 đảo chỗ. Hai chữ đổi chỗ ngay trước mắt. */
export function DiaColumns() {
  return (
    <Svg label="お預り金額とお支払金額の並びが逆の通帳">
      <Giay />
      <rect x="10" y="14" width="46" height="15" rx="1.5" fill="var(--paper-2)" />
      <rect x="62" y="14" width="46" height="15" rx="1.5" fill="var(--paper-2)" />
      <text x="33" y="25" textAnchor="middle" fontSize="10" fill="var(--sumi-2)">
        出
      </text>
      <text x="85" y="25" textAnchor="middle" fontSize="10" fill="var(--sumi-2)">
        入
      </text>
      <line x1="10" y1="38" x2="108" y2="38" stroke="var(--rule-soft)" strokeWidth="1" />
      <rect x="10" y="47" width="46" height="15" rx="1.5" fill="var(--beni-soft)" />
      <rect x="62" y="47" width="46" height="15" rx="1.5" fill="var(--beni-soft)" />
      <motion.text
        variants={{ an: { x: 0 }, hien: { x: 52, transition: { ...keO, delay: 0.25 } } }}
        x="33"
        y="58"
        textAnchor="middle"
        fontSize="10"
        fill="var(--beni)"
      >
        出
      </motion.text>
      <motion.text
        variants={{ an: { x: 0 }, hien: { x: -52, transition: { ...keO, delay: 0.25 } } }}
        x="85"
        y="58"
        textAnchor="middle"
        fontSize="10"
        fill="var(--beni)"
      >
        入
      </motion.text>
      <motion.path
        d="M33 70 C 45 78, 73 78, 85 70"
        fill="none"
        stroke="var(--shu)"
        strokeWidth="1.4"
        strokeLinecap="round"
        variants={{
          an: { pathLength: 0, opacity: 0 },
          hien: { pathLength: 1, opacity: 1, transition: { ...keO, delay: 0.45 } },
        }}
      />
    </Svg>
  )
}

/* 2 ── Bảng chú giải ký hiệu in ở chân trang. */
export function DiaLegend() {
  return (
    <Svg label="ページ下部に印刷された記号の凡例">
      <Giay />
      {[18, 26, 34, 42].map((y) => (
        <line
          key={y}
          x1="12"
          y1={y}
          x2={y === 42 ? 78 : 106}
          y2={y}
          stroke="var(--rule-soft)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      <motion.g
        variants={{
          an: { opacity: 0, y: 6 },
          hien: { opacity: 1, y: 0, transition: { ...keO, delay: 0.3 } },
        }}
      >
        <rect
          x="12"
          y="52"
          width="96"
          height="18"
          rx="2"
          fill="var(--paper)"
          stroke="var(--beni)"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <text x="18" y="64.5" fontSize="8.5" fill="var(--beni)" fontFamily="var(--font-mono)">
          K…入金 Q…支払
        </text>
      </motion.g>
    </Svg>
  )
}

/* 3 ── Kana viết to giữ nguyên, không sửa thành chữ hiện đại. */
export function DiaKana() {
  return (
    <Svg label="大書きのカナをそのまま写す">
      <Giay />
      <text x="34" y="40" textAnchor="middle" fontSize="24" fill="var(--sumi)">
        シヤ
      </text>
      <text x="34" y="58" textAnchor="middle" fontSize="8" fill="var(--shu)">
        印字のまま
      </text>
      <text x="86" y="38" textAnchor="middle" fontSize="18" fill="var(--sumi-3)">
        シャ
      </text>
      <motion.line
        x1="68"
        y1="32"
        x2="104"
        y2="32"
        stroke="var(--sumi-3)"
        strokeWidth="1.6"
        strokeLinecap="round"
        variants={{
          an: { pathLength: 0 },
          hien: { pathLength: 1, transition: { ...keO, delay: 0.35 } },
        }}
      />
      <text x="86" y="58" textAnchor="middle" fontSize="8" fill="var(--sumi-3)">
        直さない
      </text>
    </Svg>
  )
}

/* 4 ── Năm một chữ số: 7-04-30 là 令和7年. Vòng khoanh tự vẽ. */
export function DiaYear() {
  return (
    <Svg label="1桁の年号を落とさずに読む">
      <Giay />
      <text
        x="60"
        y="40"
        textAnchor="middle"
        fontSize="17"
        fill="var(--sumi)"
        fontFamily="var(--font-mono)"
      >
        7-04-30
      </text>
      <motion.ellipse
        cx="24.5"
        cy="34.5"
        rx="10"
        ry="11"
        fill="none"
        stroke="var(--shu)"
        strokeWidth="1.6"
        strokeLinecap="round"
        style={{ rotate: -12, transformOrigin: '24.5px 34.5px' }}
        variants={{
          an: { pathLength: 0, opacity: 0 },
          hien: { pathLength: 1, opacity: 1, transition: { ...keO, delay: 0.3 } },
        }}
      />
      <motion.text
        x="60"
        y="62"
        textAnchor="middle"
        fontSize="9"
        fill="var(--sumi-2)"
        variants={{ an: { opacity: 0 }, hien: { opacity: 1, transition: { ...keO, delay: 0.55 } } }}
      >
        令和7年4月30日
      </motion.text>
    </Svg>
  )
}

/* 5 ── Số thứ tự dòng in mờ ở lề trái — để phát hiện dòng bị bỏ sót. */
export function DiaRowNo() {
  return (
    <Svg label="左端の行番号で抜けを検出する">
      <Giay />
      <line x1="26" y1="10" x2="26" y2="74" stroke="var(--beni-soft)" strokeWidth="1" />
      {['01', '02', '03', '04'].map((n, k) => (
        <motion.g
          key={n}
          variants={{
            an: { opacity: 0, x: -5 },
            hien: { opacity: 1, x: 0, transition: { ...keO, delay: 0.2 + k * 0.09 } },
          }}
        >
          <text x="11" y={24 + k * 14} fontSize="8" fill="var(--beni)" fontFamily="var(--font-mono)">
            {n}
          </text>
          <line
            x1="32"
            y1={21 + k * 14}
            x2={k === 2 ? 78 : 106}
            y2={21 + k * 14}
            stroke="var(--rule-soft)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </motion.g>
      ))}
    </Svg>
  )
}

/* 6 ── Dòng không phải giao dịch: ô tiền để TRỐNG nên cộng tổng không lệch. */
export function DiaNote() {
  return (
    <Svg label="取引ではない行は金額欄を空にする">
      <Giay />
      {[0, 1, 2].map((k) => {
        const y = 18 + k * 18
        return (
          <g key={k}>
            <line
              x1="12"
              y1={y + 5}
              x2="52"
              y2={y + 5}
              stroke="var(--rule-soft)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {k === 1 ? (
              <motion.rect
                x="62"
                y={y - 2}
                width="46"
                height="14"
                rx="1.5"
                fill="none"
                stroke="var(--beni)"
                strokeWidth="1"
                strokeDasharray="3 2.5"
                variants={{
                  an: { opacity: 0 },
                  hien: { opacity: 1, transition: { ...keO, delay: 0.35 } },
                }}
              />
            ) : (
              <rect x="62" y={y - 2} width="46" height="14" rx="1.5" fill="var(--paper-2)" />
            )}
          </g>
        )
      })}
      <motion.text
        x="85"
        y="44"
        textAnchor="middle"
        fontSize="7.5"
        fill="var(--beni)"
        variants={{ an: { opacity: 0 }, hien: { opacity: 1, transition: { ...keO, delay: 0.5 } } }}
      >
        繰越
      </motion.text>
    </Svg>
  )
}

/* 7 ── Một tấm ảnh có hai cuốn sổ — tách ra theo từng tài khoản. */
export function DiaTwoBooks() {
  return (
    <Svg label="1枚の写真に複数の通帳が写っていても口座ごとに分ける">
      <motion.g
        variants={{ an: { x: 10, y: 6 }, hien: { x: 0, y: 0, transition: { ...keO, delay: 0.25 } } }}
      >
        <rect x="6" y="16" width="52" height="58" rx="2" fill="var(--paper-3)" stroke="var(--rule)" />
        {[26, 34, 42, 50, 58].map((y) => (
          <line
            key={y}
            x1="12"
            y1={y}
            x2="52"
            y2={y}
            stroke="var(--rule-soft)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        <text x="32" y="70" textAnchor="middle" fontSize="7.5" fill="var(--sumi-3)">
          口座A
        </text>
      </motion.g>
      <motion.g
        variants={{
          an: { x: -10, y: 6 },
          hien: { x: 0, y: 0, transition: { ...keO, delay: 0.25 } },
        }}
      >
        <rect x="62" y="16" width="52" height="58" rx="2" fill="var(--paper-3)" stroke="var(--rule)" />
        {[26, 34, 42, 50].map((y) => (
          <line
            key={y}
            x1="68"
            y1={y}
            x2="108"
            y2={y}
            stroke="var(--rule-soft)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        <text x="88" y="70" textAnchor="middle" fontSize="7.5" fill="var(--sumi-3)">
          口座B
        </text>
      </motion.g>
      <motion.line
        x1="60"
        y1="10"
        x2="60"
        y2="80"
        stroke="var(--shu)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
        variants={{ an: { opacity: 0 }, hien: { opacity: 1, transition: { ...keO, delay: 0.5 } } }}
      />
    </Svg>
  )
}

/* 8 ── Nếp gấp giữa hai trang cắt ngang các dòng. */
export function DiaFold() {
  return (
    <Svg label="見開きの折り目をまたぐページ">
      <Giay />
      {[20, 30, 40, 50, 60].map((y) => (
        <line
          key={y}
          x1="12"
          y1={y}
          x2="108"
          y2={y}
          stroke="var(--rule-soft)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
      <defs>
        <linearGradient id="nepgap" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--sumi)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--sumi)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--sumi)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.rect
        x="48"
        y="8"
        width="24"
        height="68"
        fill="url(#nepgap)"
        variants={{
          an: { opacity: 0, x: -16 },
          hien: { opacity: 1, x: 0, transition: { ...keO, delay: 0.28 } },
        }}
      />
      <motion.path
        d="M12 70 L108 70"
        stroke="var(--shu)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        variants={{
          an: { pathLength: 0 },
          hien: { pathLength: 1, transition: { ...keO, delay: 0.5 } },
        }}
      />
    </Svg>
  )
}

/* ── Bốn công cụ chỉnh ảnh ─────────────────────────────────── */

/* 9 ── Nắn phối cảnh: bốn góc kéo về đúng khung chữ nhật. */
export function DiaKeystone() {
  const goc = [
    { an: { cx: 22, cy: 22 }, hien: { cx: 14, cy: 14 } },
    { an: { cx: 100, cy: 15 }, hien: { cx: 106, cy: 14 } },
    { an: { cx: 104, cy: 66 }, hien: { cx: 106, cy: 70 } },
    { an: { cx: 18, cy: 72 }, hien: { cx: 14, cy: 70 } },
  ]
  return (
    <Svg label="台形補正で四隅を合わせる">
      <motion.polygon
        points="22,22 100,15 104,66 18,72"
        fill="var(--paper-2)"
        stroke="var(--rule)"
        variants={{ an: { opacity: 1 }, hien: { opacity: 0, transition: { ...keO, delay: 0.3 } } }}
      />
      <motion.rect
        x="14"
        y="14"
        width="92"
        height="56"
        rx="2"
        fill="var(--paper-3)"
        stroke="var(--rule)"
        variants={{ an: { opacity: 0 }, hien: { opacity: 1, transition: { ...keO, delay: 0.3 } } }}
      />
      {[26, 36, 46, 56].map((y) => (
        <motion.line
          key={y}
          x1="22"
          y1={y}
          x2="98"
          y2={y}
          stroke="var(--rule-soft)"
          strokeWidth="2.2"
          strokeLinecap="round"
          variants={{ an: { opacity: 0 }, hien: { opacity: 1, transition: { ...keO, delay: 0.42 } } }}
        />
      ))}
      {goc.map((g, k) => (
        <motion.circle
          key={k}
          r="4.2"
          fill="var(--shu)"
          variants={{ an: g.an, hien: { ...g.hien, transition: { ...keO, delay: 0.3 } } }}
        />
      ))}
    </Svg>
  )
}

/* 10 ── Cắt bỏ bìa và tiêu đề. */
export function DiaCrop() {
  const nhay = { an: { opacity: 0.25 }, hien: { opacity: 1, transition: { ...keO, delay: 0.3 } } }
  return (
    <Svg label="切り抜きで表紙や見出しを落とす">
      <rect
        x="6"
        y="8"
        width="108"
        height="68"
        rx="2"
        fill="var(--paper-2)"
        stroke="var(--rule-soft)"
        strokeDasharray="3 3"
      />
      <motion.rect
        rx="1.5"
        fill="var(--paper-3)"
        stroke="var(--shu)"
        strokeWidth="1.4"
        variants={{
          an: { x: 6, y: 8, width: 108, height: 68 },
          hien: { x: 22, y: 22, width: 76, height: 44, transition: { ...keO, delay: 0.25 } },
        }}
      />
      {[32, 42, 52].map((y) => (
        <motion.line
          key={y}
          x1="28"
          y1={y}
          x2="92"
          y2={y}
          stroke="var(--rule-soft)"
          strokeWidth="2.2"
          strokeLinecap="round"
          variants={nhay}
        />
      ))}
    </Svg>
  )
}

/* 11 ── Xoay 90° và chỉnh nghiêng từng độ. */
export function DiaRotate() {
  return (
    <Svg label="回転と傾きの微調整">
      <motion.g
        style={{ transformOrigin: '60px 42px' }}
        variants={{ an: { rotate: -14 }, hien: { rotate: 0, transition: { ...keO, delay: 0.25 } } }}
      >
        <rect x="26" y="14" width="68" height="56" rx="2" fill="var(--paper-3)" stroke="var(--rule)" />
        {[26, 36, 46, 56].map((y) => (
          <line
            key={y}
            x1="33"
            y1={y}
            x2="87"
            y2={y}
            stroke="var(--rule-soft)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
      </motion.g>
      <motion.path
        d="M14 54 A 30 30 0 0 1 26 26"
        fill="none"
        stroke="var(--shu)"
        strokeWidth="1.5"
        strokeLinecap="round"
        variants={{
          an: { pathLength: 0 },
          hien: { pathLength: 1, transition: { ...keO, delay: 0.4 } },
        }}
      />
      <text x="103" y="70" textAnchor="middle" fontSize="8" fill="var(--sumi-3)" fontFamily="var(--font-mono)">
        1°
      </text>
    </Svg>
  )
}

/* 12 ── Sáng và tương phản: chữ in mờ rõ hẳn lên. */
export function DiaLevels() {
  return (
    <Svg label="明るさとコントラストの調整">
      <Giay />
      {[22, 32, 42, 52, 62].map((y, k) => (
        <motion.line
          key={y}
          x1="12"
          y1={y}
          x2="108"
          y2={y}
          stroke="var(--sumi)"
          strokeWidth="2.4"
          strokeLinecap="round"
          variants={{
            an: { opacity: 0.14 },
            hien: { opacity: 0.14 + k * 0.16, transition: { ...keO, delay: 0.22 + k * 0.06 } },
          }}
        />
      ))}
      <motion.line
        x1="12"
        y1="74"
        x2="108"
        y2="74"
        stroke="var(--shu)"
        strokeWidth="1.4"
        strokeLinecap="round"
        variants={{
          an: { pathLength: 0 },
          hien: { pathLength: 1, transition: { ...keO, delay: 0.3 } },
        }}
      />
    </Svg>
  )
}

/** Thứ tự khớp đúng với `reads.items` và `tools.items` trong lib/i18n.tsx. */
export const HINH_READS = [
  DiaColumns,
  DiaLegend,
  DiaKana,
  DiaYear,
  DiaRowNo,
  DiaNote,
  DiaTwoBooks,
  DiaFold,
]

export const HINH_TOOLS = [DiaKeystone, DiaCrop, DiaRotate, DiaLevels]
