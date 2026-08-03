"use client";

/**
 * Khung giữa: XƯỞNG CHỈNH ẢNH — làm ảnh đúng chiều và dễ đọc trước khi quét.
 *
 * Nguyên tắc đã chốt: **mọi thao tác chỉnh ảnh chỉ tác động MẶT SỔ ĐANG HIỆN
 * Ở ĐÂY**, dù bên trái đang tick bao nhiêu mặt. Tick là để chọn quét; chỉnh ảnh
 * là việc của trang đang mở. Không trộn hai ý nghĩa vào một lần bấm.
 *
 * Hai tầng thao tác:
 *   • Thanh trượt = xem trước bằng CSS, tức thì, không tốn gì.
 *   • 「Áp dụng」 mới ghi thật vào ảnh — vì ảnh đổi = mất cache = tốn tiền quét lại.
 *
 * Ảnh hiện ở ~70% chiều rộng khung: file 4000px hay 500px đều cùng cỡ, và cân
 * với cột kết quả bên phải.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sheetImage, type Sheet } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Box = { left: number; top: number; right: number; bottom: number };

/** Một góc của vùng nắn, theo tỉ lệ 0..1 của ảnh. */
type Pt = [number, number];

/** Trái-trên → phải-trên → phải-dưới → trái-dưới. Thứ tự này khớp với backend. */
const FULL_QUAD: Pt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Điểm giữa 4 cạnh: trên → phải → dưới → trái.
 *
 * Sổ mở ra thường KHÔNG bẹt phẳng, còn cong sấp, nên mép trang là đường cong
 * chứ không phải đoạn thẳng — 4 góc thôi thì không tả được. Kéo điểm giữa cạnh
 * là uốn cong cạnh đó.
 */
function midsOf(q: Pt[]): Pt[] {
  const giua = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [giua(q[0], q[1]), giua(q[1], q[2]), giua(q[2], q[3]), giua(q[3], q[0])];
}

/** Hai thanh trượt → 4 góc.
 *
 * `doc` (dọc): chụp chếch từ trên xuống thì mép TRÊN của trang bị thu hẹp lại.
 * Kéo dương = coi như mép trên đang hẹp, nắn cho nó rộng ra bằng mép dưới.
 * `ngang` làm y hệt nhưng cho hai mép trái/phải.
 *
 * Tối đa 25% bề rộng: quá tay nữa thì ảnh giãn tới mức chữ nhoè không đọc nổi.
 */
function quadFromSliders(doc: number, ngang: number): Pt[] {
  const kv = (doc / 100) * 0.25;
  const kh = (ngang / 100) * 0.25;
  const [t, b] = kv >= 0 ? [kv, 0] : [0, -kv];      // thu mép trên / mép dưới
  const [l, r] = kh >= 0 ? [kh, 0] : [0, -kh];      // thu mép trái / mép phải
  return [
    [t, l],
    [1 - t, r],
    [1 - b, 1 - r],
    [b, 1 - l],
  ];
}

const BASE_WIDTH = 0.7; // 70% — chốt theo yêu cầu, để cân với cột review

function Tool({
  onClick,
  disabled,
  title,
  children,
  icon,
  tone = "normal",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  /** Chữ trên nút — TỰ ẨN khi thanh công cụ hẹp, chỉ còn `icon`. */
  children?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "normal" | "accent" | "ghost";
}) {
  const cls =
    tone === "accent"
      ? "border-accent bg-accent font-semibold text-accentink hover:brightness-110"
      : tone === "ghost"
        ? "border-transparent bg-transparent text-ink2 hover:bg-card2 hover:text-ink"
        : "border-rule bg-card text-ink2 hover:border-accentmid hover:text-ink";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-8 flex-none items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors disabled:opacity-40 ${cls}`}
    >
      {icon}
      {/* Thanh công cụ hẹp thì bỏ chữ, giữ biểu tượng — vẫn có `title` và
          `aria-label` nên không mất nghĩa.
          ⚠ CHỈ giấu chữ khi nút CÓ biểu tượng. Nút không có biểu tượng mà
          giấu chữ thì thành ô trống, người dùng không đoán nổi nó là gì —
          đã ship nhầm đúng lỗi này với nút「↕ 180°」và「Quét trang này」. */}
      {children != null && (
        <span className={icon ? "hidden @[560px]:inline" : ""}>{children}</span>
      )}
    </button>
  );
}

/** Một dòng trong menu ⋯ — chữ đầy đủ, không bao giờ bị rút gọn. */
function MenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left text-[12.5px] disabled:opacity-35 ${
        danger ? "text-danger hover:bg-danger/10" : "text-ink2 hover:bg-card2"
      }`}
    >
      {children}
    </button>
  );
}

function Slider({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onReset,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center gap-2" title={label}>
      <span className="flex-none text-ink3">{icon}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full flex-1 accent-[var(--accent)]"
      />
      <button
        onClick={onReset}
        className="tnum w-[46px] flex-none rounded px-1 text-right text-[11px] text-ink3 hover:bg-card2 hover:text-ink"
        title={label}
      >
        {value > 0 && unit === "°" ? "+" : ""}
        {value}
        {unit}
      </button>
    </div>
  );
}

export default function SheetViewer({
  wsId,
  sheet,
  busy,
  scanning,
  onRotate,
  onAdjust,
  onCrop,
  onWarp,
  onReset,
  onUndo,
  onScanThis,
  onDelete,
  highlight,
  highlightExact,
  highlightSkew,
  stale,
}: {
  wsId: string;
  sheet: Sheet | null;
  busy: boolean;
  scanning: boolean;
  onRotate: (deg: number) => void;
  onAdjust: (a: {
    fine_deg: number;
    brightness: number;
    contrast: number;
  }) => Promise<boolean>;
  onCrop: (box: Box) => void;
  onWarp: (corners: [number, number][], mids: [number, number][]) => void;
  onReset: () => void;
  onUndo: () => void;
  onScanThis: () => void;
  onDelete: () => void;
  /** Dải ảnh của dòng đang chọn ở bảng kết quả — để khoanh đúng chỗ. */
  highlight: { y0: number; y1: number } | null;
  highlightExact: boolean;
  /** Trang chụp nghiêng bao nhiêu độ — vệt nghiêng theo cho khớp dòng chữ. */
  highlightSkew: number;
  /** Có kết quả cũ nhưng ảnh đã bị chỉnh sau đó → kết quả không còn khớp. */
  stale: boolean;
}) {
  const { t } = useT();

  const [zoom, setZoom] = useState(1);
  const [fine, setFine] = useState(0);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [cropping, setCropping] = useState(false);
  const [menu, setMenu] = useState(false);      // menu ⋯ (việc ít dùng)
  const [box, setBox] = useState<Box | null>(null);

  /* ── Nắn phối cảnh ────────────────────────────────────────────────
     `quad` là NGUỒN SỰ THẬT DUY NHẤT: 4 góc của vùng sẽ được kéo thành hình
     chữ nhật. Hai thanh trượt chỉ là cách nhanh để đặt lại 4 góc đó — kéo tay
     một góc rồi động vào thanh trượt thì 4 góc bị tính lại từ đầu (có ghi rõ
     trong dòng nhắc), vì giữ hai nguồn sự thật song song thì không ai đoán
     nổi kết quả. */
  const [warping, setWarping] = useState(false);
  const [quad, setQuad] = useState<Pt[]>(FULL_QUAD);
  const [mids, setMids] = useState<Pt[]>(midsOf(FULL_QUAD));
  const [vert, setVert] = useState(0);
  const [horz, setHorz] = useState(0);
  /* Đang kéo tay nắm nào: 0-3 là góc, 4-7 là điểm giữa cạnh.
     Dùng ref chứ KHÔNG dùng state: state phải chờ React vẽ lại mới có giá trị
     mới, mà `pointermove` đầu tiên có thể tới ngay trong cùng một nhịp —
     lúc đó state vẫn là null nên cú kéo đầu bị nuốt. */
  const grab = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const imgBox = useRef<HTMLDivElement>(null);
  const scrollBox = useRef<HTMLDivElement>(null);
  /* Di ảnh bằng transform translate, KHÔNG bằng scrollLeft/scrollTop: ảnh nhỏ
     hơn khung thì không có gì để cuộn, kéo sẽ chẳng nhúc nhích — đúng lỗi
     người dùng gặp. translate thì di được mọi lúc, kể cả ra ngoài khung. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  /* Cỡ hiển thị của ảnh, tính bằng JS thay vì để CSS tự lo.
   *
   * Trước đây ảnh rộng cố định 70% khung, chiều cao thì tuỳ tỉ lệ ảnh — sổ dọc
   * trên màn hình thấp là tràn ra ngoài và bị `overflow-hidden` cắt mất đầu và
   * chân. Hậu quả: vào chế độ Cắt / Nắn phối cảnh thì **không với tới được hai
   * tay nắm trên và dưới**, phải zoom nhỏ lại mới làm được (người dùng báo
   * 03/08/2026).
   *
   * Tính tay thì bảo đảm ảnh LUÔN lọt trong khung ở mọi cỡ màn hình, mà 4 tay
   * nắm vẫn đặt theo % của đúng khung ảnh nên toạ độ không lệch.
   */
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const aw = sheet?.width ?? 0;
  const ah = sheet?.height ?? 0;

  /* Đo lại sau MỖI lần vẽ, cộng thêm khi cửa sổ đổi cỡ.
   *
   * Đo sau mỗi lần vẽ nghe có vẻ thừa, nhưng nó tự đúng trong mọi tình huống:
   * đổi mặt sổ, đổi thẻ khung trên điện thoại (khung từ `hidden` thành hiện),
   * mở/đóng thanh cảnh báo... Không lặp vô tận vì chỉ gọi `setFit` khi số ĐO
   * ĐƯỢC lệch quá nửa pixel.
   *
   * Cố ý KHÔNG chỉ dựa vào `ResizeObserver`: đã gặp môi trường nó không kích
   * hoạt dù phần tử đổi cỡ thật, và khi đó ảnh giữ nguyên cỡ cũ rồi tràn ra
   * ngoài khung — đúng cái lỗi đang phải sửa.
   */
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (!box || !aw || !ah) return;
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // Chừa 4% mép để tay nắm ở sát biên vẫn bấm được
    const k = Math.min((r.width * BASE_WIDTH) / aw, (r.height * 0.96) / ah);
    const w = aw * k;
    const h = ah * k;
    if (!fit || Math.abs(fit.w - w) > 0.5 || Math.abs(fit.h - h) > 0.5) {
      setFit({ w, h });
    }
  });

  useEffect(() => {
    const doLai = () => setFit(null);      // xoá đi, lần vẽ kế sẽ đo lại
    window.addEventListener("resize", doLai);
    return () => window.removeEventListener("resize", doLai);
  }, []);

  const dirty = fine !== 0 || bright !== 100 || contrast !== 100;

  const clearPreview = () => {
    setFine(0);
    setBright(100);
    setContrast(100);
  };

  /** Đưa ảnh về đúng cỡ vừa khung, bỏ mọi phóng to/di chuyển đang có. */
  const vuaKhung = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    setCropping(false);
    setBox(null);
    // 4 góc là của ẢNH NÀY — đổi sang mặt sổ khác mà giữ lại là nắn nhầm chỗ
    setWarping(false);
    setMenu(false);
    setQuad(FULL_QUAD);
    setMids(midsOf(FULL_QUAD));
    setVert(0);
    setHorz(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    clearPreview();
  }, [sheet?.id]);

  if (!sheet) {
    return (
      <div className="canvas-bg flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-[15px] font-semibold text-ink2">{t.viewerEmpty}</p>
        <p className="max-w-xs text-[12.5px] text-ink3">{t.viewerEmptyHint}</p>
      </div>
    );
  }

  const rel = (e: React.MouseEvent) => {
    const r = imgBox.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Thanh công cụ ─────────────────────────────────────── */}
      <div className="@container flex flex-wrap items-center gap-1.5 border-b border-rule bg-card px-3 py-2">
        <Tool onClick={() => onRotate(-90)} disabled={busy} title={t.rotateLeft}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden> <path d="M3 8h11a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H8" /> <path d="M6.5 4.5 3 8l3.5 3.5" /> </svg>}
        >
          −90°
        </Tool>
        <Tool onClick={() => onRotate(90)} disabled={busy} title={t.rotateRight}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden> <path d="M21 8H10a5 5 0 0 0-5 5v1a5 5 0 0 0 5 5h6" /> <path d="M17.5 4.5 21 8l-3.5 3.5" /> </svg>}
        >
          +90°
        </Tool>
        <span className="mx-0.5 h-5 w-px flex-none bg-rule" />

        {/* Nắn phối cảnh — ảnh chụp chếch thì trang ra hình thang, xoay không cứu được */}
        {!warping ? (
          <Tool
            onClick={() => {
              setWarping(true);
              setCropping(false);
              vuaKhung();          // đang phóng to mà vào nắn thì tay nắm nằm ngoài màn hình
              setQuad(FULL_QUAD);
              setMids(midsOf(FULL_QUAD));
              setVert(0);
              setHorz(0);
            }}
            disabled={busy}
            title={t.warp}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden> <path d="M7 4h10l3 16H4Z" /> </svg>}
          >
            {t.warp}
          </Tool>
        ) : (
          <>
            <Tool
              tone="accent"
              onClick={() => {
                onWarp(quad, mids);
                setWarping(false);
              }}
              disabled={busy}
              title={t.warpApply}
            >
              ✓ {t.warpApply}
            </Tool>
            <Tool onClick={() => setWarping(false)} title={t.cancel}>
              {t.cancel}
            </Tool>
          </>
        )}

        {!cropping ? (
          <Tool
            onClick={() => {
              setCropping(true);
              setWarping(false);
              vuaKhung();
              setBox({ left: 0.06, top: 0.06, right: 0.94, bottom: 0.94 });
            }}
            disabled={busy}
            title={t.crop}
          
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden> <path d="M6.5 2v15.5H22M2 6.5h15.5V22" /> </svg>}
          >
            {t.crop}
          </Tool>
        ) : (
          <>
            <Tool
              tone="accent"
              onClick={() => {
                if (box) onCrop(box);
                setCropping(false);
                setBox(null);
              }}
              disabled={busy}
              title={t.cropApply}
            >
              ✓ {t.cropApply}
            </Tool>
            <Tool
              onClick={() => {
                setCropping(false);
                setBox(null);
              }}
              title={t.cancel}
            >
              {t.cancel}
            </Tool>
          </>
        )}

        <span className="flex-1" />

        {/* Việc CHÍNH của khung này — luôn hiện đủ chữ, không bao giờ bị giấu
            hay đẩy ra ngoài vùng nhìn thấy. */}
        <Tool tone="accent" onClick={onScanThis} disabled={scanning} title={t.scanThisPage}>
          {scanning ? t.scanning : t.scanThisPage}
        </Tool>

        {/* Việc ít dùng gom vào đây: thanh công cụ có 12 nút thì cái nào cũng
            khó tìm, mà hẹp quá lại phải cuộn ngang mới thấy「Quét trang này」. */}
        <div className="relative flex-none">
          <Tool
            onClick={() => setMenu((m) => !m)}
            title={t.moreTools}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden> <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /> </svg>}
          />
          {menu && (
            <>
              {/* Bấm ra ngoài là đóng */}
              <button
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setMenu(false)}
                aria-label={t.cancel}
              />
              <div className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-lg border border-rule bg-card py-1 shadow-[var(--shadow)]">
                <MenuItem
                  onClick={() => {
                    onRotate(180);
                    setMenu(false);
                  }}
                  disabled={busy}
                >
                  ↕ {t.flip180}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    clearPreview();
                    onUndo();
                    setMenu(false);
                  }}
                  disabled={busy || !sheet.undo}
                >
                  ↶ {t.undo}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    clearPreview();
                    onReset();
                    setMenu(false);
                  }}
                  disabled={
                    busy ||
                    (sheet.rotation === 0 &&
                      !sheet.cropped &&
                      !sheet.adjusted &&
                      !sheet.warped)
                  }
                >
                  ↺ {t.resetImage}
                </MenuItem>
                <span className="my-1 block h-px bg-rule" />
                <MenuItem
                  onClick={() => {
                    onDelete();
                    setMenu(false);
                  }}
                  disabled={busy}
                  danger
                >
                  🗑 {t.deleteSheet}
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dòng nhắc cách dùng — đặt THÀNH MỘT DẢI RIÊNG dưới thanh công cụ,
          KHÔNG phủ lên ảnh. Trước đây nó nổi ở góc trên-trái tấm ảnh và che
          mất đúng phần đầu trang sổ, mà đó lại là chỗ người dùng cần nhìn để
          kéo khung cắt / kéo góc. */}
      {(cropping || warping) && (
        <p className="flex items-start gap-2 border-b border-accent/40 bg-accentpale px-3 py-1.5 text-[11.5px] text-accent">
          <span aria-hidden>💡</span>
          <span>{warping ? t.warpHint : t.cropHint}</span>
        </p>
      )}

      {/* ── Vùng ảnh: 70% chiều rộng khung ──────────────────────
          Kéo chuột = di ảnh; Ctrl + cuộn = phóng to/thu nhỏ quanh con trỏ.
          Không làm "bôi đen lấy chữ" được vì đây là ẢNH — muốn chọn chữ thì
          phải có toạ độ từng ký tự, mà cái đó phải hỏi model (mất cache, tốn
          tiền). Chữ đã đọc ra nằm ở cột kết quả bên phải và copy được. */}
      <div
        ref={scrollBox}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          const box = scrollBox.current;
          if (!box) return;
          const r = box.getBoundingClientRect();
          // Vị trí con trỏ so với TÂM khung — dùng để giữ điểm đang trỏ đứng yên
          const mx = e.clientX - r.left - r.width / 2;
          const my = e.clientY - r.top - r.height / 2;
          setZoom((z) => {
            const next = Math.max(0.3, Math.min(6, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
            const k = next / z;
            setOffset((o) => ({
              x: mx - (mx - o.x) * k,
              y: my - (my - o.y) * k,
            }));
            return next;
          });
        }}
        onMouseDown={(e) => {
          // Đang nắn thì chuột dành cho 4 tay nắm, không dùng để di ảnh
          if (cropping || warping || e.button !== 0) return;
          e.preventDefault();
          pan.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          setPanning(true);
        }}
        onMouseMove={(e) => {
          const p = pan.current;
          if (!p) return;
          setOffset({ x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
        }}
        onMouseUp={() => {
          pan.current = null;
          setPanning(false);
        }}
        onMouseLeave={() => {
          pan.current = null;
          setPanning(false);
        }}
        onDoubleClick={() => {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        }}
        className={`canvas-bg relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${
          cropping || warping ? "" : panning ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Thanh phóng to nổi ở góc ảnh, không nằm trong thanh công cụ nữa:
            3 nút này chiếm chỗ của những nút quan trọng hơn, mà đặt cạnh ảnh
            thì còn đúng chỗ tay đang thao tác hơn. Góc dưới-phải nên không đè
            lên đầu trang sổ. */}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-rule bg-card/90 px-1 py-0.5 backdrop-blur">
          <Tool
            tone="ghost"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            title={t.zoomOut}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden> <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6" /> </svg>}
          />
          <span className="tnum w-10 text-center text-[11.5px] text-ink3">
            {Math.round(zoom * 100)}%
          </span>
          <Tool
            tone="ghost"
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            title={t.zoomIn}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden> <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6" /> </svg>}
          />
          <Tool
            tone="ghost"
            onClick={vuaKhung}
            title={t.fitFrame}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden> <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" /> </svg>}
          />
        </div>

        <div
          ref={imgBox}
          className="relative select-none"
          style={{
            // Cỡ tính sẵn để ảnh luôn lọt khung; chưa đo xong thì tạm 70% bề ngang
            width: fit ? `${fit.w}px` : `${BASE_WIDTH * 100}%`,
            height: fit ? `${fit.h}px` : undefined,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
          onMouseDown={(e) => {
            if (!cropping) return;
            const p = rel(e);
            setDrag(p);
            setBox({ left: p.x, top: p.y, right: p.x, bottom: p.y });
          }}
          onMouseMove={(e) => {
            if (!cropping || !drag) return;
            const p = rel(e);
            setBox({
              left: Math.min(drag.x, p.x),
              top: Math.min(drag.y, p.y),
              right: Math.max(drag.x, p.x),
              bottom: Math.max(drag.y, p.y),
            });
          }}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sheetImage(wsId, sheet)}
            /* Xem chú thích ở SheetRail: không có cái này thì ảnh 401. */
            crossOrigin="use-credentials"
            alt={sheet.name}
            draggable={false}
            className="block h-full w-full rounded-lg border border-rule bg-white shadow-[var(--shadow)]"
            style={{
              transform: fine ? `rotate(${fine}deg)` : undefined,
              filter:
                bright !== 100 || contrast !== 100
                  ? `brightness(${bright}%) contrast(${contrast}%)`
                  : undefined,
            }}
          />

          {/* Dòng đang chọn ở bảng kết quả — đối chiếu ảnh ↔ dòng.
              CHỈ TÔ NỀN, không kẻ viền trên/dưới và không gắn nhãn nổi: dải này
              là ƯỚC LƯỢNG từ ảnh (xem api/rowmap.py), lệch một chút là chuyện
              thường, mà viền đậm + nhãn thì che mất chữ của dòng bên cạnh —
              đúng thứ người dùng đang cần đọc.
              Dò được đúng dòng thì đậm hơn, phải chia đều thì nhạt hẳn: nhìn là
              biết chỗ nào tin được, không phải đoán. */}
          {highlight && !cropping && (
            <div
              className="pointer-events-none absolute inset-x-0 transition-all duration-200"
              style={{
                top: `${highlight.y0 * 100}%`,
                height: `${Math.max(0.006, highlight.y1 - highlight.y0) * 100}%`,
                background: `color-mix(in srgb, var(--danger) ${
                  highlightExact ? 13 : 7
                }%, transparent)`,
                // Sổ chụp nghiêng thì dòng chữ cũng nghiêng — vệt thẳng băng
                // sẽ cắt ngang hai dòng khác nhau ở hai đầu trang.
                transform: highlightSkew ? `skewY(${highlightSkew}deg)` : undefined,
              }}
              title={highlightExact ? t.rowMarkExact : t.rowMarkEstimated}
            >
              {/* Vạch mảnh ở mép trái để mắt bắt được vị trí mà không che chữ */}
              <span
                className="absolute inset-y-0 left-0 w-[3px] bg-danger"
                style={{ opacity: highlightExact ? 0.85 : 0.4 }}
              />
            </div>
          )}

          {/* Lưới canh thẳng — chỉ hiện khi đang chỉnh nghiêng, để lấy mốc so
              với dòng kẻ của sổ. Hiện thường trực thì rối mắt. */}
          {fine !== 0 && !cropping && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--danger) 55%, transparent) 0 1px, transparent 1px 40px)," +
                  "repeating-linear-gradient(to right, color-mix(in srgb, var(--danger) 30%, transparent) 0 1px, transparent 1px 40px)",
              }}
            />
          )}

          {/* Tứ giác nắn: 4 tay nắm kéo được + đường nối cho thấy vùng sẽ bị
              kéo thành hình chữ nhật. Vẽ bằng SVG vì tứ giác không phải hình
              chữ nhật nên không dùng div viền được. */}
          {warping && (
            <>
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                {/* Cạnh vẽ bằng đường cong bậc hai đi ĐÚNG qua điểm giữa —
                    phải khớp với công thức uốn cong ở backend, nếu không thì
                    xem một đằng ra một nẻo. */}
                <path
                  d={quad
                    .map((p, i) => {
                      const nxt = quad[(i + 1) % 4];
                      const m = mids[i];
                      // Điểm điều khiển để đường cong đi qua đúng m tại t=0.5
                      const cx = 2 * m[0] - (p[0] + nxt[0]) / 2;
                      const cy = 2 * m[1] - (p[1] + nxt[1]) / 2;
                      const head = i === 0 ? `M ${p[0] * 100} ${p[1] * 100} ` : "";
                      return `${head}Q ${cx * 100} ${cy * 100} ${nxt[0] * 100} ${nxt[1] * 100}`;
                    })
                    .join(" ") + " Z"}
                  fill="color-mix(in srgb, var(--accent) 12%, transparent)"
                  stroke="var(--accent)"
                  strokeWidth="0.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {[...quad, ...mids].map(([x, y], i) => {
                const laGoc = i < 4;
                return (
                  <button
                    key={i}
                    onPointerDown={(e) => {
                      e.stopPropagation();     // đừng để rơi vào thao tác kéo ảnh
                      e.currentTarget.setPointerCapture(e.pointerId);
                      grab.current = i;
                    }}
                    onPointerMove={(e) => {
                      if (grab.current !== i) return;
                      const r = imgBox.current?.getBoundingClientRect();
                      if (!r) return;
                      const nx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                      const ny = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
                      if (laGoc) {
                        /* Kéo GÓC thì kéo theo cả hai điểm giữa cạnh kề, giữ
                           nguyên độ cong người dùng đã đặt — nếu để yên, điểm
                           giữa bị bỏ lại giữa đường và cạnh vặn thành hình lạ. */
                        const truoc = quad[i];
                        const dx = nx - truoc[0];
                        const dy = ny - truoc[1];
                        const ke = [(i + 3) % 4, i];      // cạnh trước và cạnh sau góc này
                        setQuad((q) => q.map((p, k) => (k === i ? [nx, ny] : p)) as Pt[]);
                        setMids((m) =>
                          m.map((p, k) =>
                            ke.includes(k) ? [p[0] + dx / 2, p[1] + dy / 2] : p,
                          ) as Pt[],
                        );
                      } else {
                        setMids((m) =>
                          m.map((p, k) => (k === i - 4 ? [nx, ny] : p)) as Pt[],
                        );
                      }
                    }}
                    onPointerUp={() => (grab.current = null)}
                    aria-label={
                      laGoc ? t.warpCorner(i + 1) : t.warpMid(i - 3)
                    }
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-white shadow active:cursor-grabbing ${
                      laGoc
                        ? "h-5 w-5 rounded-full bg-accent"
                        : "h-4 w-4 rounded-sm bg-accentmid"
                    }`}
                    style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  />
                );
              })}
            </>
          )}

          {cropping && box && (
            <>
              <div
                className="pointer-events-none absolute border-2 border-accent"
                style={{
                  left: `${box.left * 100}%`,
                  top: `${box.top * 100}%`,
                  width: `${(box.right - box.left) * 100}%`,
                  height: `${(box.bottom - box.top) * 100}%`,
                  boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Kết quả cũ không còn khớp ảnh — phải nói ra, nếu không người dùng xuất
          file từ kết quả của một tấm ảnh khác mà không biết. */}
      {stale && (
        <div className="flex flex-wrap items-center gap-2 border-b border-warnedge bg-warnbg px-3 py-1.5">
          <span className="text-[12px] font-semibold text-warnink">⚠ {t.staleTitle}</span>
          <span className="text-[11.5px] text-warnink/90">{t.staleMsg}</span>
          <span className="flex-1" />
          <Tool tone="accent" onClick={onScanThis} disabled={scanning} title={t.scanThisPage}>
            {scanning ? t.scanning : t.rescanNow}
          </Tool>
        </div>
      )}

      {/* ── Chân khung: thanh trượt chỉnh tinh ────────────────── */}
      <div className="@container flex flex-col gap-1.5 border-t border-rule bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Slider
            label={t.fineTilt}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 19h16M6 19 14 5" />
              </svg>
            }
            value={fine}
            min={-15}
            max={15}
            step={0.5}
            unit="°"
            onChange={setFine}
            onReset={() => setFine(0)}
          />
          {/* Hai thanh nắn phối cảnh — chỉ hiện khi đang ở chế độ nắn, vì
              chúng ghi đè 4 góc nên bày ra lúc khác chỉ gây nhầm. */}
          {warping && (
            <>
              <Slider
                label={t.warpVert}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                    <path d="M8 4h8l3 16H5Z" />
                  </svg>
                }
                value={vert}
                min={-100}
                max={100}
                step={2}
                unit=""
                onChange={(v) => {
                  setVert(v);
                  const q = quadFromSliders(v, horz);
                  setQuad(q);
                  setMids(midsOf(q));
                }}
                onReset={() => {
                  setVert(0);
                  const q = quadFromSliders(0, horz);
                  setQuad(q);
                  setMids(midsOf(q));
                }}
              />
              <Slider
                label={t.warpHorz}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                    <path d="M4 8v8l16 3V5Z" />
                  </svg>
                }
                value={horz}
                min={-100}
                max={100}
                step={2}
                unit=""
                onChange={(v) => {
                  setHorz(v);
                  const q = quadFromSliders(vert, v);
                  setQuad(q);
                  setMids(midsOf(q));
                }}
                onReset={() => {
                  setHorz(0);
                  const q = quadFromSliders(vert, 0);
                  setQuad(q);
                  setMids(midsOf(q));
                }}
              />
            </>
          )}
          <Slider
            label={t.brightness}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            }
            value={bright}
            min={40}
            max={200}
            step={5}
            unit="%"
            onChange={setBright}
            onReset={() => setBright(100)}
          />
          <Slider
            label={t.contrast}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" />
              </svg>
            }
            value={contrast}
            min={40}
            max={220}
            step={5}
            unit="%"
            onChange={setContrast}
            onReset={() => setContrast(100)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <>
              <Tool
                tone="accent"
                onClick={async () => {
                  const ok = await onAdjust({
                    fine_deg: fine,
                    brightness: bright / 100,
                    contrast: contrast / 100,
                  });
                  // Xoá lớp xem trước CSS, nếu không hiệu ứng bị áp HAI LẦN
                  if (ok) clearPreview();
                }}
                disabled={busy}
                title={t.applyAdjust}
              >
                {t.applyAdjust}
              </Tool>
              <Tool onClick={clearPreview} title={t.discardPreview}>
                {t.discardPreview}
              </Tool>
              <span className="text-[11px] text-warnink">{t.previewOnly}</span>
            </>
          ) : (
            <span className="text-[11px] text-ink3">{t.adjustHint}</span>
          )}
          <span className="flex-1" />
          <span className="truncate text-[11.5px] text-ink3">
            {t.sheetLabel}: <b className="font-semibold text-ink2">{sheet.name}</b>
            <span className="tnum ml-2">
              {sheet.width}×{sheet.height}px
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
