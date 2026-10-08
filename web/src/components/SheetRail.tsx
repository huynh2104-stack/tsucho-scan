"use client";

/**
 * Khung trái: danh sách MẶT SỔ.
 *
 * Hai việc tách rõ:
 *   • ô tick  → chọn để QUÉT (nhiều mặt cùng lúc)
 *   • click thẻ → XEM mặt đó ở khung giữa
 * Shift+tick chọn cả dải.
 *
 * Ô tick VẼ BẰNG TAY, không dùng <input type=checkbox>: checkbox native ở trong
 * <label> có preventDefault từng không hiện dấu tích dù trạng thái đã đổi. Vẽ
 * tay thì cái nhìn thấy và cái trong state luôn là một.
 */

import { useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { sheetImage, type PerSheet, type Sheet } from "@/lib/api";

export type ScanState = "idle" | "wait" | "scanning" | "done" | "skipped" | "failed";

export function Tick({
  on,
  onClick,
  title,
  size = 17,
}: {
  on: boolean;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      title={title}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`flex flex-none items-center justify-center rounded-[5px] border transition-colors ${
        on
          ? "border-accent bg-accent text-accentink"
          : "border-rule bg-card hover:border-accent"
      }`}
    >
      {on && (
        <svg width={size - 6} height={size - 6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      )}
    </button>
  );
}

export default function SheetRail({
  wsId,
  sheets,
  selected,
  active,
  states,
  perSheet,
  brokenLinks,
  dupWith,
  onOpenDup,
  onToggle,
  onToggleRange,
  onActivate,
  onRename,
  onReorder,
  onDropFiles,
}: {
  wsId: string;
  sheets: Sheet[];
  selected: Set<string>;
  active: string | null;
  states: Record<string, ScanState>;
  perSheet: Record<string, PerSheet>;
  /** Mặt sổ có chuỗi số dư ĐỨT với mặt đứng ngay trước (chắc cùng một sổ, chưa bấm「Không phải lỗi」). */
  brokenLinks: Set<string>;
  /** Mặt sổ nghi là bản chụp lại → TÊN mặt sổ đứng trước mà nó nghi trùng (task 1.7). */
  dupWith: Record<string, string>;
  onOpenDup: (sheetId: string) => void;
  onToggle: (id: string) => void;
  onToggleRange: (id: string) => void;
  onActivate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (ids: string[]) => void;
  /** Thả FILE từ máy vào giữa danh sách → tải lên và chèn trước mặt sổ này. */
  onDropFiles: (files: File[], beforeId: string) => void;
}) {
  const { t } = useT();
  // Click ĐÚP mới vào chế độ sửa tên; click đơn vẫn là "xem mặt sổ này"
  const [editing, setEditing] = useState<string | null>(null);
  // Kéo thả đổi thứ tự. `dragId` để trong REF chứ không phải state: handler
  // `onDrop` phải đọc được ngay trong cùng chuỗi sự kiện, mà state thì React
  // cập nhật bất đồng bộ nên lúc thả có thể vẫn còn null.
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (targetId: string) => {
    const from = dragId.current;
    if (!from || from === targetId) return;
    const ids = sheets.map((s) => s.id).filter((i) => i !== from);
    ids.splice(ids.indexOf(targetId), 0, from);
    onReorder(ids);
  };

  if (sheets.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink3">
        {t.railEmpty}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 px-2 pb-3">
      {sheets.map((s, i) => {
        const isSel = selected.has(s.id);
        const isActive = active === s.id;
        const st = states[s.id] ?? "idle";
        const ps = perSheet[s.id];

        // Xử lý NỀN lúc nhập (tách trang, kiểm hướng, cắt gọn) — xem api/imgjobs.py
        const proc = s.status && s.status !== "ready" ? s.status : null;
        const procBusy = proc === "queued" || proc === "rendering" || proc === "analyzing";
        const noImage = !s.sha256;           // chưa render xong: chưa có ảnh để hiện
        const autoDone = !!s.auto && (s.auto.rotate !== 0 || s.auto.cropped);
        const autoUnsure = !!s.auto && !s.auto.sure && s.auto.detected !== 0 && s.auto.rotate === 0;

        // Trạng thái viết thành CHỮ, không chỉ icon
        const status: { label: string; cls: string } | null =
          proc === "failed"
            ? { label: t.stImportFailed, cls: "bg-danger/15 text-danger" }
            : procBusy
              ? {
                  label:
                    proc === "queued" ? t.stQueued : proc === "rendering" ? t.stRendering : t.stAnalyzing,
                  cls: "bg-accentpale text-accent",
                }
              : st === "scanning"
            ? { label: t.stScanning, cls: "bg-accentpale text-accent" }
            : st === "wait"
              ? { label: t.stWaiting, cls: "bg-rule2 text-ink3" }
              : st === "failed"
                ? { label: t.stFailed, cls: "bg-danger/15 text-danger" }
                : st === "skipped"
                  ? { label: t.stSkipped, cls: "bg-warnbg text-warnink" }
                  : ps
                    ? ps.need_check > 0
                      ? { label: t.stNeedCheck(ps.need_check), cls: "bg-warnbg text-warnink" }
                      : { label: t.stScanned(ps.rows), cls: "bg-okbg text-okink" }
                    : st === "done"
                      ? { label: t.stNoRows, cls: "bg-rule2 text-ink3" }
                      : null;

        return (
          /* data-need: số dòng cần soát theo định nghĩa chung (lib/review.ts) — E2E đối chiếu với bộ đếm */
          <li key={s.id} data-need={ps ? ps.need_check : undefined}>
            <div
              draggable={editing !== s.id}
              onDragStart={(e) => {
                dragId.current = s.id;
                setDragging(s.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.id);
              }}
              onDragOver={(e) => {
                // Nhận cả hai loại: đổi thứ tự (kéo thẻ) và chèn file mới
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();   // trang không xử lý lại lần nữa
                const files = Array.from(e.dataTransfer.files ?? []);
                if (files.length > 0) onDropFiles(files, s.id);  // chèn vào đây
                else if (dragId.current) drop(s.id);              // đổi thứ tự
                else onDropFiles([], s.id);                       // chỉ để tắt lớp phủ
                dragId.current = null;
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDragging(null);
                setOver(null);
              }}
              className={`flex items-start gap-2 rounded-xl border p-2 transition-colors ${
                dragging === s.id ? "opacity-40" : ""
              } ${over === s.id && dragging !== s.id ? "border-t-4 border-t-accent" : ""} ${
                isActive
                  ? "border-accent bg-accentpale/50"
                  : isSel
                    ? "border-accentmid/60 bg-card2"
                    : "border-rule bg-card hover:border-accentmid/70"
              }`}
            >
              <div className="pt-0.5">
                <Tick
                  on={isSel}
                  title={t.tickToScan}
                  onClick={(e) => {
                    if (e.shiftKey) onToggleRange(s.id);
                    else onToggle(s.id);
                  }}
                />
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => onActivate(s.id)}
                onKeyDown={(e) => {
                  // CHỈ nhận phím khi chính thẻ này đang focus. Không có điều
                  // kiện này thì phím Space gõ trong ô đổi tên bị nuốt mất —
                  // người dùng không đặt được tên có dấu cách.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate(s.id);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer gap-2 text-left"
                title={t.clickToView}
              >
                <div className="relative h-[52px] w-10 flex-none overflow-hidden rounded-md border border-rule2 bg-card2">
                  {noImage ? (
                    /* Chưa có ảnh (đang tách trang / nhập hỏng): vẽ ô chờ thay vì ảnh hỏng */
                    <span className="flex h-full w-full items-center justify-center bg-rule2/60">
                      {proc === "failed" ? (
                        <span className="text-[15px] font-bold text-danger">!</span>
                      ) : (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-accent" />
                      )}
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sheetImage(wsId, s, true)}
                      /* Ảnh sổ nằm sau lớp đăng nhập: thẻ <img> thường KHÔNG gửi
                         cookie sang cổng khác, phải khai báo use-credentials. */
                      crossOrigin="use-credentials"
                      alt=""
                      className={`h-full w-full object-cover ${
                        st === "wait" ? "opacity-40 grayscale" : ""
                      } ${procBusy ? "opacity-60" : ""}`}
                    />
                  )}
                  {st === "scanning" && (
                    <>
                      <span className="pointer-events-none absolute inset-0 bg-accent/20" />
                      <span className="scanline pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-transparent via-accentmid/70 to-transparent" />
                    </>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Tên hiện ĐỦ, xuống dòng chứ không cắt cụt.
                      Click ĐÚP để sửa — click đơn vẫn là xem mặt sổ. */}
                  {editing === s.id ? (
                    <input
                      autoFocus
                      defaultValue={s.name}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.name) onRename(s.id, v);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        const el = e.target as HTMLInputElement;
                        if (e.key === "Enter") el.blur();
                        if (e.key === "Escape") {
                          el.value = s.name;
                          el.blur();
                        }
                      }}
                      className="w-full rounded border border-accent bg-card px-1 py-0.5 text-[12.5px] font-semibold focus:outline-none"
                    />
                  ) : (
                    <span
                      className="break-words text-[12.5px] font-semibold leading-snug"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditing(s.id);
                      }}
                      title={t.dblClickRename}
                    >
                      {s.name}
                    </span>
                  )}
                  <span className="break-all text-[10.5px] leading-tight text-ink3">
                    {s.origin}
                    {s.page ? ` · ${t.pageLabel(s.page)}` : ""}
                  </span>

                  <span className="flex flex-wrap items-center gap-1 text-[10px]">
                    {status && (
                      <span
                        className={`rounded px-1.5 py-px font-semibold ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    )}
                    {brokenLinks.has(s.id) && (
                      <span
                        data-link-chip
                        className="rounded bg-warnbg px-1 font-semibold text-warnink"
                        title={t.linkRailTip}
                      >
                        ⛓✕
                      </span>
                    )}
                    {dupWith[s.id] && (
                      <button
                        type="button"
                        data-dup-chip
                        onClick={(e) => {
                          e.stopPropagation();           // không kích hoạt thẻ (chọn mặt sổ) khi bấm huy hiệu
                          onOpenDup(s.id);
                        }}
                        title={t.dupTitle}
                        className="max-w-full break-words rounded bg-warnbg px-1.5 py-px text-left font-semibold leading-snug text-warnink hover:brightness-95"
                      >
                        ⚠ {t.dupChip(dupWith[s.id])}
                      </button>
                    )}
                    {autoDone && s.auto && (
                      <span
                        className="rounded bg-accentpale px-1 font-semibold text-accent"
                        title={t.autoPrepToggleHint}
                      >
                        ✨{" "}
                        {[
                          s.auto.rotate
                            ? t.autoRotated(s.auto.rotate > 180 ? s.auto.rotate - 360 : s.auto.rotate)
                            : "",
                          s.auto.cropped ? t.autoCropped : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {autoUnsure && (
                      <span className="rounded bg-warnbg px-1 font-semibold text-warnink" title={t.autoUnsure}>
                        ⚠ {t.autoUnsureBadge}
                      </span>
                    )}
                    {/* Máy đã tự xoay/cắt thì nhãn ✨ ở trên đã nói rồi, khỏi lặp */}
                    {!autoDone && s.rotation !== 0 && (
                      <span className="tnum rounded bg-card3 px-1 text-ink2">
                        {/* 354° đọc là "nghiêng -6°" dễ hiểu hơn nhiều */}
                        {s.rotation > 180 ? s.rotation - 360 : s.rotation}°
                      </span>
                    )}
                    {!autoDone && s.cropped && (
                      <span className="rounded bg-card3 px-1 text-ink2">{t.cropped}</span>
                    )}
                    {s.adjusted && (
                      <span className="rounded bg-card3 px-1 text-ink2">
                        {t.adjustedBadge}
                      </span>
                    )}
                    {s.duplicate_of && (
                      <span className="rounded bg-warnbg px-1 font-semibold text-warnink">
                        {t.duplicateBadge}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
