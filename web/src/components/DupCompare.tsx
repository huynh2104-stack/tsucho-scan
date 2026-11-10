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
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="flex items-center gap-2 text-t13">
        <span className="tag flex-none">{label}</span>
        <span className="truncate font-bold" title={s.name}>
          {s.name}
        </span>
      </figcaption>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-md bg-bench p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sheetImage(wsId, s)}
          crossOrigin="use-credentials"
          alt={s.name}
          className="max-h-[56vh] w-auto max-w-full bg-white object-contain"
        />
      </div>
    </figure>
  );

  return (
    /* z 50: hộp xác nhận xoá (z 60 của .dlg-scrim) phải nằm đè lên hộp này */
    <div data-dup-compare className="dlg-scrim" style={{ zIndex: 50 }} onClick={onLater} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-title"
        onClick={(e) => e.stopPropagation()}
        className="dlg"
        style={{ maxWidth: 1024 }}
      >
        <header className="dlg-head flex-col items-start gap-1.5">
          <h2 id="dup-title">{t.dupTitle}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t13 font-normal text-ink2">
            <b data-dup-match className="tag tag-warn tnum">
              {t.dupMatch(pair.common, Math.min(pair.sizeA, pair.sizeB))}
            </b>
            {t.dupWhy}
          </p>
        </header>

        <div className="thin-scroll flex min-h-0 flex-1 gap-3 overflow-auto px-5 py-4">
          {panel(left, t.dupKeep)}
          {panel(right, t.dupSuspect)}
        </div>

        <footer className="dlg-foot flex-wrap">
          <button data-dup="later" onClick={onLater} className="btn btn-ghost">
            {t.dupLater}
          </button>
          <button data-dup="not" onClick={onNotDup} className="btn btn-quiet">
            {t.dupNotDup}
          </button>
          <button data-dup="delete" onClick={onDeleteRight} className="btn btn-danger-solid">
            {t.dupDeleteRight}
          </button>
        </footer>
      </div>
    </div>
  );
}
