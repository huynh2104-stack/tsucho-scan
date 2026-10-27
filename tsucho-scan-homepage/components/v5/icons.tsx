/* Vài biểu tượng nét đều 1.6, cùng một bộ cho cả trang V5. */

type P = { size?: number }

function Svg({ size = 18, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="ic"
    >
      {children}
    </svg>
  )
}

export const ArrowIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
  </Svg>
)
export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" stroke="none" />
  </Svg>
)
export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10.5 12 15.5l5-5M5 19.5h14" />
  </Svg>
)
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const MenuIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7.5h16M4 12h16M4 16.5h16" />
  </Svg>
)
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)
export const ChevronIcon = ({ dir = 'right', ...p }: P & { dir?: 'left' | 'right' }) => (
  <Svg {...p}>
    <path d={dir === 'right' ? 'm9.5 6 6 6-6 6' : 'm14.5 6-6 6 6 6'} />
  </Svg>
)
export const CrossIcon = (p: P) => (
  <Svg {...p}>
    <path d="m7.5 7.5 9 9M16.5 7.5l-9 9" />
  </Svg>
)
