"use client";

/**
 * Hộp so sánh HAI ẢNH CẠNH NHAU cho hai mặt sổ nghi là cùng một trang (task 1.7).
 *
 * Quét cả hai bản chụp thì giao dịch bị cộng gấp đôi mà file nhìn vẫn bình thường, nên đây là lúc
 * người dùng phải tự nhìn và quyết: không phải trùng / xoá bản bên phải / để sau. Máy chỉ đề xuất,
 * không tự xoá gì.
 */

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { sheetImage, type Sheet } from "@/lib/api";
import type { DupPair } from "@/lib/review";

export default function DupCompare({
  wsId,
  pair,
  left,
  right,
  suspended,
  onNotDup,
  onDeleteRight,
  onLater,
}: {
  wsId: string;
  pair: DupPair;
  left: Sheet;
  right: Sheet;
  /** Đang có hộp xác nhận chồng lên: đừng ăn phím Esc của nó. */
  suspended: boolean;
  onNotDup: () => void;
  onDeleteRight: () => void;
  onLater: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    if (suspended) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onLater();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [suspended, onLater]);

  const panel = (s: Sheet, label: string) => (
    <figure className="flex min-w-0 flex-1 flex-col gap-1.5">
      <figcaption className="flex items-baseline gap-2 text-[12.5px]">
        <span className="rounded bg-card3 px-1.5 py-0.5 text-[11px] font-semibold text-ink2">{label}</span>
        <span className="truncate font-semibold" title={s.name}>
          {s.name}
        </span>
      </figcaption>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-rule bg-canvas p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sheetImage(wsId, s)}
          crossOrigin="use-credentials"
          alt={s.name}
          className="max-h-[56vh] w-auto max-w-full object-contain"
        />
      </div>
    </figure>
  );

  return (
    <div
      data-dup-compare
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onLater}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-rule bg-card shadow-2xl"
      >
        <header className="flex flex-col gap-1 border-b border-rule px-5 py-3">
          <h2 id="dup-title" className="text-[16px] font-bold">
            {t.dupTitle}
          </h2>
          <p className="text-[12.5px] text-ink2">
            <b data-dup-match className="rounded bg-warnbg px-1.5 py-0.5 text-warnink">
              {t.dupMatch(pair.common, Math.min(pair.sizeA, pair.sizeB))}
            </b>{" "}
            {t.dupWhy}
          </p>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 overflow-auto px-5 py-4">
          {panel(left, t.dupKeep)}
          {panel(right, t.dupSuspect)}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-rule bg-card2 px-5 py-3">
          <button
            data-dup="later"
            onClick={onLater}
            className="rounded-lg border border-rule px-3.5 py-1.5 text-[13.5px] text-ink2 hover:border-accentmid hover:text-ink"
          >
            {t.dupLater}
          </button>
          <button
            data-dup="not"
            onClick={onNotDup}
            className="rounded-lg border border-accent px-3.5 py-1.5 text-[13.5px] font-semibold text-accent hover:bg-accentpale"
          >
            {t.dupNotDup}
          </button>
          <button
            data-dup="delete"
            onClick={onDeleteRight}
            className="rounded-lg border border-danger bg-danger px-3.5 py-1.5 text-[13.5px] font-semibold text-white hover:brightness-110"
          >
            {t.dupDeleteRight}
          </button>
        </footer>
      </div>
    </div>
  );
}
