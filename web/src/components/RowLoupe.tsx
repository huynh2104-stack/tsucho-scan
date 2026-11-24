"use client";

/**
 * Kính lúp dòng: dải ảnh PHÓNG TO của dòng đang chọn, gắn ở đáy khung ảnh. Ở mức 100% chữ trên ảnh rất nhỏ; thay vì
 * bắt người soát phóng ảnh và kéo qua lại, dòng đang chọn luôn hiện to ngay dưới ảnh. Dùng lại `RowStrip` của chế độ
 * soát nhanh (cùng cách cắt, cùng khung đỏ), chỉ khác là `live={false}` để không trùng các mốc `data-testid` của chế độ đó.
 *
 * Cột ảnh hẹp hơn cột kết quả nên đo bề ngang thật rồi chia đoạn theo đó (`colPx`).
 *
 * CHỖ CỦA KÍNH LÚP PHẢI ỔN ĐỊNH: nó nằm trong cột flex cùng khung ảnh, nên mỗi lần nó đổi cao là ảnh co giãn giật dưới
 * con trỏ. Vì vậy nó hiện cả khi chưa chọn dòng (câu mờ) hoặc dải đang tính lại, và phần nội dung luôn cao ít nhất bằng
 * lần vẽ dải gần nhất (`lastH`, chỉ tăng).
 */

import { useEffect, useRef, useState } from "react";
import RowStrip from "@/components/RowStrip";
import { Rows } from "@/components/ui/icons";
import type { RowBands, Sheet } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { STRIP_COL_PX } from "@/lib/quickreview";

/** Chiều cao nội dung trước khi từng vẽ dải nào (px): cỡ của dải hai khúc thường gặp, để lần chọn dòng đầu không làm khung ảnh nhảy. */
const FIRST_H = 144;

export default function RowLoupe({
  wsId,
  sheet,
  rowBands,
  bandsState,
  index,
  peekIndex = null,
  onOpenTable,
}: {
  wsId: string;
  sheet: Sheet;
  rowBands: RowBands | null;
  bandsState: "loading" | "unavailable" | "ready";
  /** Thứ tự phẳng của dòng đang chọn trong mặt sổ; null = chưa chọn dòng nào. */
  index: number | null;
  /** «Xem trước»: dòng dưới con trỏ (đã dừng đủ lâu). Có thì vẽ dải của nó thay cho `index`; hết thì về dòng đang chọn. */
  peekIndex?: number | null;
  /** Điện thoại: ảnh và bảng là hai thẻ riêng, nên có nút chuyển sang bảng. */
  onOpenTable?: () => void;
}) {
  const { t } = useT();
  const inner = useRef<HTMLDivElement>(null);
  const stripBox = useRef<HTMLDivElement>(null);
  const [colPx, setColPx] = useState(STRIP_COL_PX);
  const [lastH, setLastH] = useState(FIRST_H);
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setColPx((c) => (Math.abs(c - w) > 8 ? w : c));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bộ dải + dòng của lần "ready" gần nhất: chỉ để bắc cầu ~120ms lúc dải được tính lại, khỏi nháy khung trống.
  const key = `${sheet.id}:${sheet.sha256}`;
  // Dải đang vẽ: xem trước thì theo con trỏ, không thì dòng đang chọn. Mọi thứ dưới đây (bắc cầu, giữ chỗ, câu trống) theo `shown`.
  const peeking = peekIndex != null;
  const shown = peekIndex ?? index;
  const kept = useRef<{ bands: RowBands; index: number; key: string } | null>(null);
  if (bandsState === "ready" && rowBands && shown != null) kept.current = { bands: rowBands, index: shown, key };
  const strip =
    bandsState === "ready" && rowBands && shown != null
      ? { bands: rowBands, index: shown }
      : bandsState === "loading" && shown != null && kept.current?.key === key && kept.current.index === shown
        ? kept.current
        : null;
  const hasStrip = !!strip;
  /* Chưa chọn dòng nào mà dải đã có: vẽ SẴN dải của dòng đầu ở dạng ẩn (vẫn chiếm chỗ) để biết chiều cao thật ngay từ đầu.
     Đoán bằng một hằng số thì lần chọn dòng đầu tiên kính lúp vẫn nở thêm ~20px và ảnh nhảy dưới con trỏ (đo: 491 → 473px). */
  const ghost = !strip && bandsState === "ready" && !!rowBands && rowBands.bands.length > 0;

  // Nhớ chiều cao thật của dải mỗi khi đang hiện (kể cả dải ẩn giữ chỗ)
  useEffect(() => {
    const el = stripBox.current;
    if (!(hasStrip || ghost) || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setLastH((c) => (c >= h ? c : h));   // chỉ tăng: dải thấp hơn không làm kính lúp co lại
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasStrip, ghost]);

  return (
    <div
      data-testid="row-loupe"
      data-peek={peeking ? String(peekIndex) : undefined}
      /* Viền nét đứt mảnh phân biệt «xem trước» với «đang chọn»; dùng outline (không chiếm chỗ) để khung ảnh không đổi cỡ */
      className={`flex max-h-[32%] min-h-0 flex-none flex-col overflow-y-auto bg-shell2 px-3 py-1.5 ${
        peeking ? "outline outline-1 -outline-offset-1 outline-dashed outline-shellink2" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-t12 text-shellink2">
        <span className="min-w-0 flex-1 truncate font-bold">{peeking ? t.loupePeek : t.loupeTitle}</span>
        {onOpenTable && (
          <button type="button" onClick={onOpenTable} className="btn btn-ghost btn-sm flex-none gap-1 lg:hidden">
            <Rows size={14} />
            {t.openInTable}
          </button>
        )}
      </div>
      <div ref={inner} style={{ minHeight: lastH }} className="relative">
        {strip ? (
          <div ref={stripBox}>
            <RowStrip
              wsId={wsId}
              sheet={sheet}
              bands={strip.bands}
              bandsState="ready"
              index={strip.index}
              stale={false}
              live={false}
              colPx={colPx}
              maxSegments={2}
            />
          </div>
        ) : ghost ? (
          <div ref={stripBox} aria-hidden className="invisible">
            <RowStrip wsId={wsId} sheet={sheet} bands={rowBands} bandsState="ready" index={0} stale={false} live={false} colPx={colPx} maxSegments={2} />
          </div>
        ) : null}
        {!strip && shown == null && (
          <p data-testid="row-loupe-empty" className="absolute inset-0 flex items-center justify-center text-center text-t12 text-shellink2">
            {t.loupeEmpty}
          </p>
        )}
      </div>
    </div>
  );
}
