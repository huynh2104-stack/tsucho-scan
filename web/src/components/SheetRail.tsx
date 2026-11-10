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
import { Check, CircleNotch, LinkBreak, Warning, WarningCircle } from "@/components/ui/icons";

export type ScanState = "idle" | "wait" | "scanning" | "done" | "skipped" | "failed";

/** Tâm ảnh thu nhỏ tính từ đầu mục (đệm 6px + nửa ảnh 60px): mắt xích treo đúng ngang đây. */
const NODE_Y = 36;
/** Khoảng hở của đường chuỗi quanh biểu tượng đứt, tính từ ranh giới hai mặt sổ. */
const BREAK_GAP = 9;

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
      /* Ô vẽ nhỏ cho gọn cột, vùng bấm thì đủ 28px (40px trên điện thoại) nhờ lớp đè vô hình */
      className={`relative flex flex-none items-center justify-center rounded-sm border transition-colors before:absolute before:-inset-1.5 before:content-[''] max-lg:before:-inset-3 ${
        on
          ? "border-accent bg-accent text-accentink"
          : "border-ink3 bg-card hover:border-accent"
      }`}
    >
      {on && <Check size={size - 5} weight="bold" />}
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
    return <p className="ml-3.5 px-1.5 py-2 text-t13 leading-relaxed text-ink3">{t.railEmpty}</p>;
  }

  return (
    <ul className="flex flex-col pb-2">
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
            ? { label: t.stImportFailed, cls: "tag-shu" }
            : procBusy
              ? { label: proc === "queued" ? t.stQueued : proc === "rendering" ? t.stRendering : t.stAnalyzing, cls: "bg-rule2" }
              : st === "scanning"
                ? { label: t.stScanning, cls: "bg-rule2" }
                : st === "wait"
                  ? { label: t.stWaiting, cls: "bg-rule2" }
                  : st === "failed"
                    ? { label: t.stFailed, cls: "tag-shu" }
                    : st === "skipped"
                      ? { label: t.stSkipped, cls: "tag-warn" }
                      : ps
                        ? ps.need_check > 0
                          ? { label: t.stNeedCheck(ps.need_check), cls: "tag-warn" }
                          : { label: t.stScanned(ps.rows), cls: "tag-ok" }
                        : st === "done"
                          ? { label: t.stNoRows, cls: "bg-rule2" }
                          : null;

        /* Việc máy/người đã làm với ảnh: chỉ là ghi chú nên viết thành một dòng chữ nhỏ, không thành thêm thẻ.
           Máy đã tự xoay/cắt thì nói việc máy làm, khỏi lặp số độ. 354° đọc là -6° dễ hiểu hơn nhiều. */
        const notes = [
          ...(autoDone && s.auto
            ? [
                s.auto.rotate ? t.autoRotated(s.auto.rotate > 180 ? s.auto.rotate - 360 : s.auto.rotate) : "",
                s.auto.cropped ? t.autoCropped : "",
              ]
            : [s.rotation !== 0 ? `${s.rotation > 180 ? s.rotation - 360 : s.rotation}°` : "", s.cropped ? t.cropped : ""]),
          s.adjusted ? t.adjustedBadge : "",
        ].filter(Boolean);

        // Chuỗi số dư đi tiếp qua các mặt sổ: chỗ nối hai mặt mà đứt thì đường hở ra, có biểu tượng 朱 đứng giữa
        const first = i === 0;
        const last = i === sheets.length - 1;
        const broken = brokenLinks.has(s.id);
        const nextBroken = !last && brokenLinks.has(sheets[i + 1].id);
        const lineTop = first ? NODE_Y : broken ? BREAK_GAP : 0;
        const open = broken || (ps?.need_check ?? 0) > 0;

        return (
          /* data-need: số dòng cần soát theo định nghĩa chung (lib/review.ts) — E2E đối chiếu với bộ đếm */
          <li key={s.id} data-need={ps ? ps.need_check : undefined} className="relative pb-1">
            {sheets.length > 1 && (
              <span
                aria-hidden
                className="absolute left-1.5 w-0.5 bg-[var(--chain-rail)]"
                style={
                  last
                    ? { top: lineTop, height: NODE_Y - lineTop }
                    : { top: lineTop, bottom: nextBroken ? BREAK_GAP : 0 }
                }
              />
            )}
            {/* Cùng ngôn ngữ với chuỗi trong sổ: đứt = vòng 朱 rỗng, đã quét và nối được = mắt xích đặc,
                chưa quét = vòng mảnh trung tính */}
            <span
              aria-hidden
              className={`absolute rounded-full ${
                open
                  ? "left-[2px] h-2.5 w-2.5 border-2 border-shu bg-page"
                  : ps
                    ? "left-[3px] h-2 w-2 bg-[var(--chain)]"
                    : "left-[3px] h-2 w-2 border border-ink3 bg-page"
              }`}
              style={{ top: NODE_Y - (open ? 5 : 4) }}
            />
            {broken && (
              <button
                type="button"
                data-link-chip
                title={t.linkRailTip}
                aria-label={t.linkRailTip}
                onClick={() => onActivate(s.id)}
                className="absolute -top-[7px] left-0 z-10 flex h-3.5 w-3.5 items-center justify-center bg-page text-shu before:absolute before:-inset-2 before:content-['']"
              >
                <LinkBreak size={13} weight="bold" />
              </button>
            )}

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
              /* Mặt đang xem là tờ trắng đặt lên nền tint; các mặt khác nằm phẳng trên nền. Không viền, không thẻ. */
              className={`relative ml-3.5 rounded-sm p-1.5 transition-colors max-lg:mr-2.5 ${dragging === s.id ? "opacity-40" : ""} ${
                isActive ? "bg-card shadow-ply" : "hover:bg-card/60"
              }`}
            >
              {/* Vạch chỗ thả: đè lên chứ không đẩy dòng xuống */}
              {over === s.id && dragging !== s.id && (
                <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-[3px] h-0.5 bg-accent" />
              )}

              {/* Ô tick đứng cạnh chứ không nằm TRONG nút xem (nút lồng nút là sai), chỉ đặt đè lên góc ảnh để chữ có đủ chỗ */}
              <div className="absolute left-[9px] top-[9px] z-10 flex">
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
                className="flex min-w-0 cursor-pointer gap-2 text-left"
                title={t.clickToView}
              >
                <div className="relative h-[60px] w-11 flex-none overflow-hidden rounded-sm bg-card3 shadow-ply">
                  {noImage ? (
                    /* Chưa có ảnh (đang tách trang / nhập hỏng): vẽ ô chờ thay vì ảnh hỏng */
                    <span className="flex h-full w-full items-center justify-center">
                      {proc === "failed" ? (
                        <WarningCircle size={20} className="text-danger" />
                      ) : (
                        <CircleNotch size={18} className="animate-spin text-ink3 motion-reduce:animate-none" />
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
                    <span
                      className="scanline pointer-events-none absolute inset-x-0 top-0 h-[78%]"
                      style={{
                        background:
                          "linear-gradient(to bottom, transparent 4%, color-mix(in srgb, var(--accent) 22%, transparent) 12%, var(--accent) 13%, var(--accent) 15%, transparent 15.5%)",
                      }}
                    />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Click ĐÚP để sửa — click đơn vẫn là xem mặt sổ. */}
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
                      className="field min-h-[calc(26px*var(--fs))] px-1 text-t13 font-bold"
                    />
                  ) : (
                    <span
                      className="line-clamp-2 text-t13 font-bold leading-snug [overflow-wrap:anywhere]"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditing(s.id);
                      }}
                      title={t.dblClickRename}
                    >
                      {s.name}
                    </span>
                  )}
                  <span className="truncate text-t12 leading-tight text-ink3" title={s.origin}>
                    {s.origin}
                    {s.page ? ` · ${t.pageLabel(s.page)}` : ""}
                  </span>

                  {(status || dupWith[s.id] || autoUnsure || s.duplicate_of) && (
                    <span className="flex flex-wrap items-center gap-1">
                      {status && <span className={`tag tnum whitespace-normal ${status.cls}`}>{status.label}</span>}
                      {dupWith[s.id] && (
                        <button
                          type="button"
                          data-dup-chip
                          onClick={(e) => {
                            e.stopPropagation();           // không kích hoạt thẻ (chọn mặt sổ) khi bấm huy hiệu
                            onOpenDup(s.id);
                          }}
                          title={t.dupTitle}
                          className="tag tag-warn max-w-full cursor-pointer whitespace-normal py-0.5 text-left leading-snug [overflow-wrap:anywhere] hover:bg-warnedge"
                        >
                          <Warning size={13} className="flex-none" />
                          <span className="min-w-0">{t.dupChip(dupWith[s.id])}</span>
                        </button>
                      )}
                      {autoUnsure && (
                        <span className="tag tag-warn" title={t.autoUnsure}>
                          <Warning size={13} />
                          {t.autoUnsureBadge}
                        </span>
                      )}
                      {s.duplicate_of && <span className="tag tag-warn">{t.duplicateBadge}</span>}
                    </span>
                  )}

                  {notes.length > 0 && (
                    <span className="tnum text-t12 leading-tight text-ink3" title={autoDone ? t.autoPrepToggleHint : undefined}>
                      {notes.join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
