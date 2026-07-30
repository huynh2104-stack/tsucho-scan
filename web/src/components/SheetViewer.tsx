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

import { useEffect, useRef, useState } from "react";
import { sheetImage, type AutofixPlan, type Sheet } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Box = { left: number; top: number; right: number; bottom: number };

const BASE_WIDTH = 0.7; // 70% — chốt theo yêu cầu, để cân với cột review

function Tool({
  onClick,
  disabled,
  title,
  children,
  tone = "normal",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
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
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors disabled:opacity-40 ${cls}`}
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
  onReset,
  onUndo,
  onScanThis,
  onDelete,
  onAutofix,
  onSplit,
  autofix,
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
  onReset: () => void;
  onUndo: () => void;
  onScanThis: () => void;
  onDelete: () => void;
  onAutofix: () => void;
  onSplit: (x: number) => void;
  autofix: AutofixPlan | null;
}) {
  const { t } = useT();

  const [zoom, setZoom] = useState(1);
  const [fine, setFine] = useState(0);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [cropping, setCropping] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const imgBox = useRef<HTMLDivElement>(null);

  const dirty = fine !== 0 || bright !== 100 || contrast !== 100;

  const clearPreview = () => {
    setFine(0);
    setBright(100);
    setContrast(100);
  };

  useEffect(() => {
    setCropping(false);
    setBox(null);
    setZoom(1);
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
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule bg-card px-3 py-2">
        <Tool onClick={() => onRotate(-90)} disabled={busy} title={t.rotateLeft}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h11a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H8" />
            <path d="M6.5 4.5 3 8l3.5 3.5" />
          </svg>
          −90°
        </Tool>
        <Tool onClick={() => onRotate(90)} disabled={busy} title={t.rotateRight}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 8H10a5 5 0 0 0-5 5v1a5 5 0 0 0 5 5h6" />
            <path d="M17.5 4.5 21 8l-3.5 3.5" />
          </svg>
          +90°
        </Tool>
        <Tool onClick={() => onRotate(180)} disabled={busy} title={t.flip180}>
          ↕ 180°
        </Tool>

        <span className="mx-1 h-5 w-px bg-rule" />

        {!cropping ? (
          <Tool
            onClick={() => {
              setCropping(true);
              setBox({ left: 0.06, top: 0.06, right: 0.94, bottom: 0.94 });
            }}
            disabled={busy}
            title={t.crop}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6.5 2v15.5H22M2 6.5h15.5V22" />
            </svg>
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

        <Tool
          onClick={() => {
            clearPreview();
            onReset();
          }}
          disabled={busy || (sheet.rotation === 0 && !sheet.cropped && !sheet.adjusted)}
          title={t.resetImage}
        >
          ↺ {t.resetImage}
        </Tool>
        {/* Hoàn tác một bước — cứu cú bấm nhầm「Về ảnh gốc」sau khi đã chỉnh xong */}
        <Tool
          onClick={() => {
            clearPreview();
            onUndo();
          }}
          disabled={busy || !sheet.undo}
          title={sheet.undo ? t.undoHint : t.undoNothing}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9h11a5 5 0 0 1 0 10H9" />
            <path d="M7.5 5.5 4 9l3.5 3.5" />
          </svg>
          {t.undo}
        </Tool>

        <span className="flex-1" />

        <Tool tone="ghost" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} title="−">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6" />
          </svg>
        </Tool>
        <span className="tnum w-10 text-center text-[12px] text-ink3">
          {Math.round(zoom * 100)}%
        </span>
        <Tool tone="ghost" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="+">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6" />
          </svg>
        </Tool>
        <Tool tone="ghost" onClick={() => setZoom(1)} title={t.fitFrame}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
          </svg>
        </Tool>

        <Tool tone="accent" onClick={onScanThis} disabled={scanning} title={t.scanThisPage}>
          {scanning ? t.scanning : t.scanThisPage}
        </Tool>
        <Tool onClick={onDelete} disabled={busy} title={t.deleteSheet}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
          </svg>
        </Tool>
      </div>

      {/* ── Vùng ảnh: 70% chiều rộng khung ────────────────────── */}
      <div className="canvas-bg thin-scroll flex min-h-0 flex-1 items-start justify-center overflow-auto p-5">
        <div
          ref={imgBox}
          className="relative select-none"
          style={{ width: `${Math.min(BASE_WIDTH * zoom, 1) * 100}%` }}
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
            alt={sheet.name}
            draggable={false}
            className="block w-full rounded-lg border border-rule bg-white shadow-[var(--shadow)]"
            style={{
              transform: fine ? `rotate(${fine}deg)` : undefined,
              filter:
                bright !== 100 || contrast !== 100
                  ? `brightness(${bright}%) contrast(${contrast}%)`
                  : undefined,
            }}
          />

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
              <p className="pointer-events-none absolute left-2 top-2 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accentink">
                {t.cropHint}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Cắt nhanh thông minh — chạy bằng thuật toán nên $0 ── */}
      {autofix && (autofix.steps.length > 0 || autofix.gutter !== null) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-accentpale/50 px-3 py-1.5">
          <span className="text-[11.5px] font-semibold text-accent">{t.autofixTitle}</span>
          {autofix.steps.length > 0 && (
            <>
              <span className="text-[11.5px] text-ink2">
                {autofix.steps
                  .map((st) =>
                    st.kind === "crop"
                      ? t.afCrop
                      : st.kind === "rotate"
                        ? t.afRotate(st.degrees)
                        : t.afTilt(st.degrees),
                  )
                  .join(" · ")}
              </span>
              <Tool tone="accent" onClick={onAutofix} disabled={busy} title={t.autofixApply}>
                {t.autofixApply}
              </Tool>
            </>
          )}
          {autofix.gutter !== null && (
            <Tool
              onClick={() => onSplit(autofix.gutter!)}
              disabled={busy}
              title={t.splitHint}
            >
              ⇥ {t.splitTwo}
            </Tool>
          )}
          <span className="flex-1" />
          <span className="text-[10.5px] text-ink3">{t.autofixNo180}</span>
        </div>
      )}

      {/* ── Chân khung: thanh trượt chỉnh tinh ────────────────── */}
      <div className="flex flex-col gap-1.5 border-t border-rule bg-card px-3 py-2">
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
