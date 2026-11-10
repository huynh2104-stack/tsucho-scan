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
 * Khung này nằm trên mực đậm (`.on-ink` ở page.tsx): tấm ảnh là chi tiết duy nhất, nên công cụ chỉ một hàng,
 * thanh trượt gom sau nút 補正.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sheetImage, type Sheet } from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowUUpLeft,
  ArrowsClockwise,
  Check,
  CircleNotch,
  CornersOut,
  Eye,
  EyeSlash,
  Crop,
  DotsThree,
  ImageIcon,
  Lightbulb,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Perspective,
  Scan,
  SlidersHorizontal,
  Trash,
  Warning,
  X,
} from "@/components/ui/icons";

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

/* Phần ảnh chiếm trong khung. Khung ảnh giờ hẹp hơn sổ nên ảnh lấy gần hết bề ngang, chừa mép cho tay nắm khi cắt. */
const BASE_WIDTH = 0.94;

/** Cỡ chung của nút trên thanh công cụ: 28px trên máy tính, 40px trên điện thoại. */
const TOOL = "btn btn-sm flex-none min-w-[calc(28px*var(--fs))] px-1.5 max-lg:min-h-10 max-lg:min-w-10";
const TOOL_TONE = { ghost: "btn-ghost", quiet: "btn-quiet", primary: "btn-primary" };

function Tool({
  onClick,
  disabled,
  title,
  children,
  icon,
  tone = "ghost",
  textAt = "hidden @[42em]:inline",
  className = "",
  expanded,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  /** Chữ trên nút — TỰ ẨN khi thanh công cụ hẹp, chỉ còn `icon`. */
  children?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TOOL_TONE;
  /** Từ bề rộng nào của thanh thì hiện chữ. Tính bằng em để cỡ chữ lớn tự co về biểu tượng sớm hơn. */
  textAt?: string;
  className?: string;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      className={`${TOOL} ${TOOL_TONE[tone]} ${className}`}
    >
      {icon}
      {/* Thanh công cụ hẹp thì bỏ chữ, giữ biểu tượng — vẫn có `title` và
          `aria-label` nên không mất nghĩa.
          ⚠ CHỈ giấu chữ khi nút CÓ biểu tượng. Nút không có biểu tượng mà
          giấu chữ thì thành ô trống, người dùng không đoán nổi nó là gì —
          đã ship nhầm đúng lỗi này với nút「↕ 180°」và「Quét trang này」. */}
      {children != null && <span className={icon ? textAt : ""}>{children}</span>}
    </button>
  );
}

/** Một dòng trong menu ⋯ — chữ đầy đủ, không bao giờ bị rút gọn. */
function MenuItem({
  onClick,
  disabled,
  danger,
  icon,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[calc(32px*var(--fs))] w-full items-center gap-2 whitespace-nowrap px-3 text-left text-t13 transition-colors hover:bg-shell3 disabled:opacity-40 disabled:hover:bg-transparent max-lg:min-h-10 ${
        danger ? "text-shuonink" : "text-shellink"
      } ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Một hàng thanh trượt. Ba ô `contents` để các hàng dùng chung lưới của khung chứa: nhãn và số thẳng cột. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onReset,
}: {
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
    <div className="contents" title={label}>
      <span className="truncate text-t12 text-shellink2">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-ink"
      />
      <button
        type="button"
        onClick={onReset}
        className="tnum min-h-7 min-w-[3.6em] rounded-sm px-1 text-right text-t12 text-shellink2 transition-colors hover:bg-shell3 hover:text-shellink"
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
  scanBeam,
  onRotate,
  onAdjust,
  onCrop,
  onWarp,
  onReset,
  onUndo,
  onScanThis,
  onDelete,
  highlight,
  highlightKind,
  highlightSkew,
  highlightSpan,
  stale,
}: {
  wsId: string;
  sheet: Sheet | null;
  busy: boolean;
  scanning: boolean;
  /** Mặt đang xem chính là mặt máy đang đọc: tia quét lướt trên ảnh. */
  scanBeam: boolean;
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
  /** Cách tìm ra dải đó: khớp nội dung / suy từ các dòng đã khớp (khung liền) hay chỉ ước lượng (khung nét đứt). */
  highlightKind: "content" | "inferred" | "estimated";
  /** Bề ngang TỜ GIẤY trong ảnh (0..1) — vệt chỉ kéo trong khoảng này. */
  highlightSpan: { x0: number; x1: number } | null;
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
  const [adjust, setAdjust] = useState(false);   // bảng 補正
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
  const zoomNow = useRef(1);
  zoomNow.current = zoom;
  /* Khung đỏ của dòng đang chọn: có người thấy rối mắt, nên cho tắt; nhớ trên máy này */
  const [showMark, setShowMark] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("tsucho.rowmark") === "0") setShowMark(false);
    } catch {
      /* không đọc được thì cứ hiện */
    }
  }, []);
  const toggleMark = () =>
    setShowMark((v) => {
      try {
        localStorage.setItem("tsucho.rowmark", v ? "0" : "1");
      } catch {
        /* không nhớ được cũng không sao */
      }
      return !v;
    });

  /* Lăn chuột = phóng to / thu nhỏ quanh con trỏ (không cần giữ Ctrl). Mỗi nấc chuột (deltaY ≈ 100) chỉ ~10%, bàn di chuột
     thì mượt theo độ lăn. Phải gắn listener thường với passive:false: onWheel của React là passive nên không chặn được trang. */
  useEffect(() => {
    const box = scrollBox.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      // Vị trí con trỏ so với TÂM khung — giữ điểm đang trỏ đứng yên
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const z = zoomNow.current;
      const next = Math.max(0.3, Math.min(6, z * Math.exp(-Math.max(-200, Math.min(200, dy)) * 0.001)));
      const k = next / z;
      zoomNow.current = next;
      setZoom(next);
      setOffset((o) => ({ x: mx - (mx - o.x) * k, y: my - (my - o.y) * k }));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);
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
    // Chừa mép để tay nắm ở sát biên vẫn bấm được
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

  /* Kéo vạch chia giữa ảnh và sổ không làm trang vẽ lại (xem Splitter) nên phải tự nghe đổi cỡ. Cách đo sau mỗi lần vẽ ở
     trên vẫn giữ: observer không bắn khi khung đi từ ẩn sang hiện. */
  const hasSheet = !!sheet;
  useEffect(() => {
    const box = scrollBox.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFit(null));
    ro.observe(box);
    return () => ro.disconnect();
  }, [hasSheet]);

  /* Chọn một dòng ở bảng mà dải của nó đang nằm NGOÀI khung nhìn (ảnh đang phóng to, hoặc đã bị kéo đi) thì đưa dải về
     giữa khung theo chiều dọc. Chỉ chạy khi DÒNG đổi, không chạy khi người dùng kéo/zoom: nếu không ảnh cứ giật về chỗ
     cũ mỗi lần họ muốn nhìn chỗ khác. Dải còn nhìn thấy thì để yên — ảnh tự nhảy khi không cần là rối mắt. */
  const markY = highlight ? (highlight.y0 + highlight.y1) / 2 : null;
  const fitH = fit?.h ?? 0;
  useEffect(() => {
    const box = scrollBox.current;
    if (markY == null || !fitH || !box) return;
    const half = box.getBoundingClientRect().height / 2;
    const dy = (markY - 0.5) * fitH * zoomNow.current;
    setOffset((o) => (Math.abs(o.y + dy) <= Math.max(0, half - 28) ? o : { x: o.x, y: -dy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markY]);

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
    setAdjust(false);
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
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-md border border-dashed border-shellrule px-6 py-10">
          <ImageIcon size={32} className="text-shellink2" />
          <p className="text-t16 font-bold leading-normal text-shellink">{t.viewerEmpty}</p>
          <p className="text-t13 leading-normal text-balance text-shellink2 [word-break:auto-phrase]">{t.viewerEmptyHint}</p>
        </div>
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

  const startWarp = () => {
    setWarping(true);
    setCropping(false);
    setAdjust(false);    // bảng 補正 che đúng góc có tay nắm
    vuaKhung();          // đang phóng to mà vào nắn thì tay nắm nằm ngoài màn hình
    setQuad(FULL_QUAD);
    setMids(midsOf(FULL_QUAD));
    setVert(0);
    setHorz(0);
  };

  // Đang cắt/nắn mà thanh hẹp: chỗ dành cho Áp dụng/Huỷ, các nút còn lại tạm lui (huỷ là có lại)
  const editing = cropping || warping;
  const yields = editing ? "hidden @[38em]:inline-flex" : "";

  const adjustFields = (
    <>
      <Slider label={t.fineTilt} value={fine} min={-15} max={15} step={0.5} unit="°" onChange={setFine} onReset={() => setFine(0)} />
      <Slider label={t.brightness} value={bright} min={40} max={200} step={5} unit="%" onChange={setBright} onReset={() => setBright(100)} />
      <Slider label={t.contrast} value={contrast} min={40} max={220} step={5} unit="%" onChange={setContrast} onReset={() => setContrast(100)} />
    </>
  );

  const autoLabel =
    sheet.auto && (sheet.auto.rotate !== 0 || sheet.auto.cropped)
      ? [
          sheet.auto.rotate
            ? t.autoRotated(sheet.auto.rotate > 180 ? sheet.auto.rotate - 360 : sheet.auto.rotate)
            : "",
          sheet.auto.cropped ? t.autoCropped : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* ── Thanh công cụ: MỘT hàng cao cố định, không bao giờ xuống dòng ── */}
      <div className="@container flex h-11 flex-none items-center gap-0.5 border-b border-shellrule px-2">
        <Tool onClick={() => onRotate(-90)} disabled={busy} title={t.rotateLeft} className={yields}
          icon={<ArrowCounterClockwise size={16} />}
        />
        <Tool onClick={() => onRotate(90)} disabled={busy} title={t.rotateRight} className={yields}
          icon={<ArrowClockwise size={16} />}
        />
        <span aria-hidden className={`mx-1 hidden h-4 w-px flex-none bg-shellrule ${editing ? "" : "@[30em]:block"}`} />

        {!cropping ? (
          <Tool
            onClick={() => {
              setCropping(true);
              setWarping(false);
              setAdjust(false);    // bảng 補正 che đúng góc có tay nắm
              vuaKhung();
              setBox({ left: 0.06, top: 0.06, right: 0.94, bottom: 0.94 });
            }}
            disabled={busy}
            title={t.crop}
            icon={<Crop size={16} />}
          >
            {t.crop}
          </Tool>
        ) : (
          <>
            <Tool
              tone="primary"
              onClick={() => {
                if (box) onCrop(box);
                setCropping(false);
                setBox(null);
              }}
              disabled={busy}
              title={t.cropApply}
              textAt=""
              className="px-2"
              icon={<Check size={15} weight="bold" />}
            >
              {t.cropApply}
            </Tool>
            <Tool
              tone="quiet"
              onClick={() => {
                setCropping(false);
                setBox(null);
              }}
              title={t.cancel}
              className="px-2"
            >
              {t.cancel}
            </Tool>
          </>
        )}

        {/* Nắn phối cảnh — ảnh chụp chếch thì trang ra hình thang, xoay không cứu được */}
        {!warping ? (
          <Tool
            onClick={startWarp}
            disabled={busy}
            title={t.warp}
            className={editing ? yields : "hidden @[20em]:inline-flex"}
            icon={<Perspective size={16} />}
          >
            {t.warp}
          </Tool>
        ) : (
          <>
            <Tool
              tone="primary"
              onClick={() => {
                onWarp(quad, mids);
                setWarping(false);
              }}
              disabled={busy}
              title={t.warpApply}
              textAt=""
              className="px-2"
              icon={<Check size={15} weight="bold" />}
            >
              {t.warpApply}
            </Tool>
            <Tool tone="quiet" onClick={() => setWarping(false)} title={t.cancel} className="px-2">
              {t.cancel}
            </Tool>
          </>
        )}

        <Tool
          onClick={() => setAdjust((a) => !a)}
          title={t.adjustPanel}
          expanded={adjust}
          className={`${yields} ${adjust || dirty ? "!bg-shell3 !text-shellink" : ""}`}
          icon={<SlidersHorizontal size={16} />}
        >
          {t.adjustPanel}
        </Tool>
        <span aria-hidden className={`mx-1 hidden h-4 w-px flex-none bg-shellrule ${editing ? "" : "@[30em]:block"}`} />
        <Tool
          onClick={() => {
            clearPreview();
            onUndo();
          }}
          disabled={busy || !sheet.undo}
          title={t.undo}
          className={editing ? yields : "hidden @[23em]:inline-flex"}
          icon={<ArrowUUpLeft size={16} />}
        />

        {/* Việc ít dùng gom vào đây: thanh công cụ có 12 nút thì cái nào cũng
            khó tìm, mà hẹp quá lại phải cuộn ngang mới thấy「Quét trang này」. */}
        <div className="relative flex-none">
          <Tool onClick={() => setMenu((m) => !m)} title={t.moreTools} expanded={menu} icon={<DotsThree size={18} weight="bold" />} />
          {menu && (
            <>
              {/* Bấm ra ngoài là đóng */}
              <button
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setMenu(false)}
                aria-label={t.cancel}
              />
              <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[200px] rounded-md bg-shell2 py-1 shadow-lift">
                <MenuItem
                  onClick={() => {
                    onRotate(180);
                    setMenu(false);
                  }}
                  disabled={busy}
                  icon={<ArrowsClockwise size={16} />}
                >
                  {t.flip180}
                </MenuItem>
                {/* Thanh hẹp đã giấu hai nút này thì menu phải có lối vào */}
                <MenuItem
                  onClick={() => {
                    startWarp();
                    setMenu(false);
                  }}
                  disabled={busy}
                  className="@[20em]:hidden"
                  icon={<Perspective size={16} />}
                >
                  {t.warp}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    clearPreview();
                    onUndo();
                    setMenu(false);
                  }}
                  disabled={busy || !sheet.undo}
                  className="@[23em]:hidden"
                  icon={<ArrowUUpLeft size={16} />}
                >
                  {t.undo}
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
                  icon={<ImageIcon size={16} />}
                >
                  {t.resetImage}
                </MenuItem>
                <span className="my-1 block h-px bg-shellrule" />
                <MenuItem
                  onClick={() => {
                    onDelete();
                    setMenu(false);
                  }}
                  disabled={busy}
                  danger
                  icon={<Trash size={16} />}
                >
                  {t.deleteSheet}
                </MenuItem>
              </div>
            </>
          )}
        </div>

        <span className="min-w-0 flex-1" />

        {/* Việc CHÍNH của khung này. Hẹp quá thì chỉ còn biểu tượng nhưng không bao giờ bị đẩy ra ngoài. */}
        <Tool
          tone="quiet"
          onClick={onScanThis}
          disabled={scanning}
          title={t.scanThisPage}
          textAt="hidden @[27.5em]:inline"
          className="@[27.5em]:px-2"
          icon={scanning ? <CircleNotch size={15} className="animate-spin motion-reduce:animate-none" /> : <Scan size={16} />}
        >
          {scanning ? t.scanning : t.scanThisPage}
        </Tool>
      </div>

      {/* Bảng 補正 nổi trên khung ảnh, không phải hộp thoại: phải nhìn được ảnh đổi theo thanh trượt, và kéo ảnh được.
          Đóng lại mà còn bản xem thử thì nút 補正 vẫn sáng để không quên. */}
      {adjust && (
        <div
          role="group"
          aria-label={t.adjustPanel}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();          // Esc ở đây là đóng bảng, không phải bỏ chọn mặt sổ
            setAdjust(false);
          }}
          className="absolute left-2 top-[52px] z-30 w-[340px] max-w-[calc(100%-16px)] rounded-md bg-shell2 p-3 shadow-lift"
        >
          <div className="flex items-center justify-between">
            <span className="text-t13 font-bold text-shellink">{t.adjustPanel}</span>
            <Tool onClick={() => setAdjust(false)} title={t.cancel} icon={<X size={15} />} />
          </div>
          <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">{adjustFields}</div>
          <div className="mt-2 flex min-h-[calc(28px*var(--fs))] flex-wrap items-center gap-2">
            {dirty ? (
              <>
                <button
                  type="button"
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
                  className="btn btn-primary btn-sm"
                >
                  {t.applyAdjust}
                </button>
                <button type="button" onClick={clearPreview} title={t.discardPreview} className="btn btn-quiet btn-sm">
                  {t.discardPreview}
                </button>
                <span className="basis-full text-t12 leading-snug text-shellink">{t.previewOnly}</span>
              </>
            ) : (
              <span className="text-t12 leading-snug text-shellink2">{t.adjustHint}</span>
            )}
          </div>
        </div>
      )}

      {/* Kết quả cũ không còn khớp ảnh — phải nói ra, nếu không người dùng xuất
          file từ kết quả của một tấm ảnh khác mà không biết. */}
      {stale && (
        <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 bg-warnbg px-3 py-1.5 text-t12 text-warnink [&_:focus-visible]:outline-accent">
          <Warning size={14} weight="bold" className="flex-none" />
          <b className="font-bold">{t.staleTitle}</b>
          <span>{t.staleMsg}</span>
          <span className="flex-1" />
          <button type="button" onClick={onScanThis} disabled={scanning} title={t.scanThisPage} className="btn btn-primary btn-sm">
            {scanning ? t.scanning : t.rescanNow}
          </button>
        </div>
      )}
      {sheet.auto && !sheet.auto.sure && sheet.auto.detected !== 0 && sheet.auto.rotate === 0 && (
        <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-0.5 bg-warnbg px-3 py-1.5 text-t12 text-warnink">
          <Warning size={14} weight="bold" className="flex-none" />
          <b className="font-bold">{t.autoUnsureBadge}</b>
          <span>{t.autoUnsure}</span>
        </div>
      )}

      {/* Dòng nhắc cách dùng — đặt THÀNH MỘT DẢI RIÊNG dưới thanh công cụ,
          KHÔNG phủ lên ảnh. Trước đây nó nổi ở góc trên-trái tấm ảnh và che
          mất đúng phần đầu trang sổ, mà đó lại là chỗ người dùng cần nhìn để
          kéo khung cắt / kéo góc. */}
      {editing && (
        <p className="flex flex-none items-start gap-2 bg-shell2 px-3 py-1.5 text-t12 leading-snug text-shellink">
          <Lightbulb size={14} className="mt-px flex-none text-shellink2" />
          <span>{warping ? t.warpHint : t.cropHint}</span>
        </p>
      )}

      {/* ── Vùng ảnh ──────────────────────────────────────────
          Kéo chuột = di ảnh; lăn chuột = phóng to/thu nhỏ quanh con trỏ.
          Không làm "bôi đen lấy chữ" được vì đây là ẢNH — muốn chọn chữ thì
          phải có toạ độ từng ký tự, mà cái đó phải hỏi model (mất cache, tốn
          tiền). Chữ đã đọc ra nằm ở cột kết quả bên phải và copy được. */}
      <div
        ref={scrollBox}
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
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${
          cropping || warping ? "" : panning ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Thanh phóng to nổi ở mép ảnh, không nằm trong thanh công cụ nữa:
            3 nút này chiếm chỗ của những nút quan trọng hơn, mà đặt cạnh ảnh
            thì còn đúng chỗ tay đang thao tác hơn.

            XẾP DỌC chứ không xếp ngang: ảnh chưa cắt thì phủ kín khung, thanh
            nằm ngang che mất một vệt dài ở đáy — đúng chỗ hay có dòng cuối và
            góc dưới của trang sổ. Dựng dọc sát mép phải thì chỉ che một cột hẹp.

            Và ẩn hẳn khi đang CẮT hoặc NẮN PHỐI CẢNH: hai chế độ đó có tay nắm
            ở bốn góc, mà thanh này nằm đúng chỗ tay nắm góc dưới-phải. Lúc ấy
            ảnh cũng đã được kéo vừa khung sẵn (`vuaKhung`) nên không cần zoom. */}
        <div
          className={`absolute bottom-2 right-2 z-10 flex-col items-center rounded-md bg-shell2 py-0.5 shadow-ply ${
            cropping || warping ? "hidden" : "flex"
          }`}
        >
          {/* Phóng to ở TRÊN, thu nhỏ ở DƯỚI — cùng chiều với trục dọc. */}
          <Tool
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            title={t.zoomIn}
            icon={<MagnifyingGlassPlus size={16} />}
          />
          <span className="tnum px-1 py-0.5 text-t12 leading-none text-shellink2">
            {Math.round(zoom * 100)}%
          </span>
          <Tool
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            title={t.zoomOut}
            icon={<MagnifyingGlassMinus size={16} />}
          />
          <Tool onClick={vuaKhung} title={t.fitFrame} icon={<CornersOut size={16} />} />
          <Tool
            onClick={toggleMark}
            title={showMark ? t.rowMarkHide : t.rowMarkShow}
            icon={showMark ? <Eye size={16} /> : <EyeSlash size={16} />}
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
            className="block h-full w-full rounded-sm bg-white shadow-lift"
            style={{
              transform: fine ? `rotate(${fine}deg)` : undefined,
              filter:
                bright !== 100 || contrast !== 100
                  ? `brightness(${bright}%) contrast(${contrast}%)`
                  : undefined,
            }}
          />

          {/* Vệt đọc: viền 朱 quanh đúng dải của dòng đang chọn, phần ảnh trên và dưới dải tối đi như thước kẻ đặt trên trang,
              lướt theo khi chuyển dòng. Bóng đổ của chính dải làm lớp tối nên nghiêng theo dải; khung ngoài cắt nó trong
              tấm ảnh. Solid = khớp số tiền và số dư theo OCR; dashed = chỉ ước lượng hình học. Ẩn khi đang chỉnh hình vì
              toạ độ xem trước khác. */}
          {highlight && showMark && !cropping && !warping && fine === 0 && (
            <div className="pointer-events-none absolute inset-0 animate-[fadeIn_120ms_ease-out] overflow-hidden rounded-sm motion-reduce:animate-none">
              <div
                className="absolute transition-[top,height,left,width,transform] duration-[160ms] ease-out-expo motion-reduce:transition-none"
                style={{
                  top: `${highlight.y0 * 100}%`,
                  height: `${Math.max(0, highlight.y1 - highlight.y0) * 100}%`,
                  /* Chỉ kéo hết bề ngang TỜ GIẤY, không kéo hết bề ngang ẢNH.
                     Hai lý do, lý do sau mới là lý do thật:
                     1. Ảnh chụp còn cả mặt bàn hai bên — vệt quét qua đó thừa.
                     2. `skewY` của CSS xoay quanh TÂM của chính vệt này. Góc
                        nghiêng lại được api/rowmap.py đo quanh TÂM TỜ GIẤY. Tờ
                        giấy nằm lệch trong khung hình thì hai tâm khác nhau, và
                        cả vệt bị đẩy lệch đi (lệch tâm × tang góc). Cho vệt trùng
                        đúng bề ngang tờ giấy là hai tâm trùng nhau, hết lệch. */
                  left: `${(highlightSpan?.x0 ?? 0) * 100}%`,
                  width: `${((highlightSpan?.x1 ?? 1) - (highlightSpan?.x0 ?? 0)) * 100}%`,
                  border: `1.5px ${highlightKind === "estimated" ? "dashed" : "solid"} var(--mark)`,
                  // Sổ chụp nghiêng thì dòng chữ cũng nghiêng — vệt thẳng băng
                  // sẽ cắt ngang hai dòng khác nhau ở hai đầu trang.
                  transform: highlightSkew ? `skewY(${highlightSkew}deg)` : "skewY(0deg)",
                }}
                title={highlightKind === "content" ? t.rowMarkExact : highlightKind === "inferred" ? t.rowMarkInferred : t.rowMarkEstimated}
              />
            </div>
          )}

          {/* Tia quét lướt qua ảnh của mặt đang quét. `scanSweep` dời -14%..114% theo chiều cao của CHÍNH lớp này, nên lớp cao
              78% ảnh và tia nằm ở 14% của lớp thì tia đi đúng từ mép trên tới mép dưới, không chạy quá ra ngoài. */}
          {scanBeam && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm">
              <span
                className="scanline absolute inset-x-0 top-0 h-[78%]"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 8%, color-mix(in srgb, var(--accent) 10%, transparent) 12%, rgb(255 255 255 / 0.4) 13.7%, var(--accent) 13.8%, var(--accent) 14%, transparent 14.1%)",
                }}
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
                  "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--accent) 55%, transparent) 0 1px, transparent 1px 40px)," +
                  "repeating-linear-gradient(to right, color-mix(in srgb, var(--accent) 30%, transparent) 0 1px, transparent 1px 40px)",
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
                        /* ĐIỂM GIỮA CẠNH: chỉ cho đi VUÔNG GÓC với cạnh.
                           Trước đây thả tự do cả hai chiều, mà trượt DỌC theo
                           cạnh thì không phải là uốn cong — nó kéo lệch tham số
                           của đường cong, làm cả trang vặn đi, và muốn trả về
                           thẳng thì phải rà đúng một điểm nên gần như không
                           sửa lại được. Chiếu điểm thả lên đường vuông góc đi
                           qua trung điểm hai góc: kéo ra là cong, kéo về là
                           thẳng, chỉ còn MỘT chiều nên tay làm là được ngay.

                           Tính trong toạ độ PIXEL (nhân với bề rộng/cao khung)
                           rồi mới đổi lại về 0..1 — khung ảnh không vuông, làm
                           thẳng trên toạ độ 0..1 thì "vuông góc" không còn
                           vuông trên màn hình và tay kéo thấy trượt. */
                        const c = i - 4;
                        const a = quad[c];
                        const b = quad[(c + 1) % 4];
                        const ax = a[0] * r.width, ay = a[1] * r.height;
                        const bx = b[0] * r.width, by = b[1] * r.height;
                        const gx = (ax + bx) / 2, gy = (ay + by) / 2;
                        const dai = Math.hypot(bx - ax, by - ay) || 1;
                        const px = -(by - ay) / dai, py = (bx - ax) / dai;
                        const t =
                          (e.clientX - r.left - gx) * px + (e.clientY - r.top - gy) * py;
                        const kep = (v: number) => Math.max(0, Math.min(1, v));
                        setMids((m) =>
                          m.map((p, k) =>
                            k === c
                              ? [kep((gx + t * px) / r.width), kep((gy + t * py) / r.height)]
                              : p,
                          ) as Pt[],
                        );
                      }
                    }}
                    onPointerUp={() => (grab.current = null)}
                    /* Bấm đúp vào điểm giữa = trả CẠNH ĐÓ về thẳng. Kéo tay về
                       đúng đường thẳng vẫn được, nhưng lỡ uốn quá đà thì bấm
                       đúp là xong, không phải rà. Bấm đúp vào GÓC thì không
                       làm gì — góc không có trạng thái "thẳng" để trả về. */
                    onDoubleClick={() => {
                      if (laGoc) return;
                      const c = i - 4;
                      const a = quad[c];
                      const b = quad[(c + 1) % 4];
                      setMids((m) =>
                        m.map((p, k) =>
                          k === c ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : p,
                        ) as Pt[],
                      );
                    }}
                    aria-label={
                      laGoc ? t.warpCorner(i + 1) : t.warpMid(i - 3)
                    }
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-white shadow-ply before:absolute before:-inset-1.5 before:content-[''] active:cursor-grabbing max-lg:before:-inset-3 ${
                      laGoc
                        ? "h-5 w-5 rounded-full bg-accent"
                        : "h-4 w-4 rounded-sm bg-accent"
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

      {/* Hai thanh nắn phối cảnh — chỉ hiện khi đang ở chế độ nắn, vì
          chúng ghi đè 4 góc nên bày ra lúc khác chỉ gây nhầm. */}
      {warping && (
        <div className="grid flex-none grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-3 bg-shell2 px-3 py-1">
          <Slider
            label={t.warpVert}
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
        </div>
      )}

      {/* Chú thích dưới ảnh. Việc máy đã tự làm lúc nhập ghi ở đây; nút hoàn tác ảnh ở thanh công cụ. */}
      <div className="flex h-7 flex-none items-center gap-3 px-3 text-t12 text-shellink2">
        <span className="min-w-0 flex-1 truncate">
          {t.sheetLabel}: <b className="font-bold text-shellink">{sheet.name}</b>
          <span className="tnum ml-2">
            {sheet.width}×{sheet.height}px
          </span>
        </span>
        {autoLabel && (
          /* Hẹp thì ghi chú co trước, tên mặt sổ và cỡ ảnh giữ nguyên */
          <span className="tnum min-w-0 shrink-[99] truncate" title={autoLabel}>
            {autoLabel}
          </span>
        )}
      </div>
    </div>
  );
}
