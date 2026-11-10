"use client";

/**
 * Vạch kéo giữa khung ảnh và sổ (chỉ từ lg). Sổ là nhân vật chính nên mặc định chiếm 62% phần còn lại sau cột trang.
 *
 * Giá trị ghi thẳng vào biến CSS `--split` của lưới chứ không qua state của trang: kéo mà vẽ lại cả trang thì bảng hàng
 * trăm dòng giật theo từng nhịp chuột. Khung ảnh tự đo lại bằng ResizeObserver của nó.
 *
 * Lưới lấy bằng `parentElement` chứ không nhận ref từ trang: ref của phần tử CHA gắn SAU layout effect của con, nên lúc
 * đọc bề rộng đã nhớ thì ref đó còn null và F5 mất luôn bề rộng.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const KEY = "tsucho.split";
const DEFAULT = 0.62;
const STEP = 0.02;
const LEDGER_MIN = 620;
const BENCH_MIN = 220;

/** Khoảng phần của sổ đang cho phép. Tính theo pixel thật vì cửa sổ và cỡ chữ đều đổi được. */
function limits(grid: HTMLElement) {
  const rail = parseFloat(getComputedStyle(grid).getPropertyValue("--rail-w")) || 216;
  const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs")) || 1;
  const rest = Math.max(1, grid.clientWidth - rail);
  const hi = Math.max(0, rest - BENCH_MIN) / rest;
  return { rest, hi, lo: Math.min(hi, (LEDGER_MIN * fs) / rest) };
}

export default function Splitter() {
  const { t } = useT();
  const self = useRef<HTMLDivElement>(null);
  const grid = () => self.current?.parentElement ?? null;
  const [share, setShare] = useState(DEFAULT);
  const [range, setRange] = useState({ lo: 0.5, hi: 0.8 });
  const [drag, setDrag] = useState(false);
  const from = useRef<{ x: number; share: number; rest: number } | null>(null);

  const paint = useCallback((v: number) => {
    self.current?.parentElement?.style.setProperty("--split", String(v));
    setShare(v);
  }, []);
  const remember = (v: number) => {
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      /* trình duyệt chặn localStorage: chỉ mất việc nhớ bề rộng */
    }
  };

  // Đọc trước khi vẽ để bảng không nhảy bề rộng sau khi hiện ra
  useLayoutEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem(KEY) ?? "");
      if (v > 0 && v < 1) paint(v);
    } catch {
      /* dùng mặc định */
    }
  }, [paint]);

  useEffect(() => {
    const measure = () => {
      const g = self.current?.parentElement;
      if (!g) return;
      const { lo, hi } = limits(g);
      setRange((r) => (r.lo === lo && r.hi === hi ? r : { lo, hi }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const move = (v: number) => {
    const g = grid();
    if (!g) return;
    const { lo, hi } = limits(g);
    const next = Math.min(hi, Math.max(lo, v));
    paint(next);
    remember(next);
  };

  return (
    <div
      ref={self}
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizeLabel}
      /* Giá trị là bề rộng khung bên TRÁI (khung ảnh), đúng chiều với phím mũi tên */
      aria-valuenow={Math.round((1 - share) * 100)}
      aria-valuemin={Math.round((1 - range.hi) * 100)}
      aria-valuemax={Math.round((1 - range.lo) * 100)}
      title={t.resizeHint}
      tabIndex={0}
      data-drag={drag ? "" : undefined}
      className="splitter hidden lg:block"
      onPointerDown={(e) => {
        const g = grid();
        if (!g || e.button !== 0) return;
        e.preventDefault();                     // không bôi đen chữ của bảng khi kéo
        e.currentTarget.setPointerCapture(e.pointerId);
        from.current = { x: e.clientX, share, rest: limits(g).rest };
        setDrag(true);
      }}
      onPointerMove={(e) => {
        const f = from.current;
        const g = grid();
        if (!f || !g) return;
        const { lo, hi } = limits(g);
        paint(Math.min(hi, Math.max(lo, f.share - (e.clientX - f.x) / f.rest)));
      }}
      onPointerUp={() => {
        if (!from.current) return;
        from.current = null;
        setDrag(false);
        remember(share);
      }}
      onPointerCancel={() => {
        from.current = null;
        setDrag(false);
      }}
      onDoubleClick={() => {
        paint(DEFAULT);
        remember(DEFAULT);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") move(share + STEP);
        else if (e.key === "ArrowRight") move(share - STEP);
        else if (e.key === "Home") move(range.hi);
        else if (e.key === "End") move(range.lo);
        else return;
        e.preventDefault();
      }}
    />
  );
}
