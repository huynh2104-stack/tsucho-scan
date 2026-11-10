"use client";

/**
 * Thanh công cụ của sổ: đếm số còn lại, sang dòng cần soát kế, soát nhanh, hoàn tác, trạng thái lưu, xuất file.
 *
 * Luôn chỉ MỘT nút đặc: còn dòng cần soát thì đó là «soát nhanh», soát xong thì mới tới lượt «xuất file».
 *
 * Cụm trạng thái bên phải KHÔNG được làm thanh xuống dòng. Từng có lỗi: chọn một dòng là hiện「vị trí ước
 * lượng…」, thanh bị đẩy xuống dòng thứ hai và cả bảng bên dưới tụt một nấc NGAY GIỮA lúc người dùng đang
 * nhấn chuột, nên cú bấm nút nhỏ ở dòng chưa chọn bị trượt. Thanh luôn CAO CỐ ĐỊNH, chữ dài tự cắt.
 */

import { noGlyph } from "@/components/ReviewPane";
import {
  ArrowRight,
  ArrowUUpLeft,
  ArrowUUpRight,
  Check,
  CircleNotch,
  DownloadSimple,
  LinkBreak,
  Play,
  Warning,
} from "@/components/ui/icons";
import { useT } from "@/lib/i18n";

export default function LedgerToolbar({
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  onNextBad,
  badCount,
  totalNeed,
  quickOpen,
  onQuick,
  alarmCount,
  onFirstBreak,
  saveState,
  rowLink,
  onExport,
  exportDisabled,
  tagCount,
}: {
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onNextBad: () => void;
  badCount: number;
  totalNeed: number;
  quickOpen: boolean;
  onQuick: () => void;
  alarmCount: number;
  onFirstBreak: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  rowLink: "exact" | "inferred" | "estimated" | "loading" | "unavailable" | null;
  onExport: () => void;
  exportDisabled: boolean;
  /** Số hiện ở nhãn đếm: của mặt đang xem, không có mặt nào đang xem thì là tổng. */
  tagCount: number;
}) {
  const { t } = useT();
  return (
    <div className="@container flex h-11 flex-none items-center gap-1.5 overflow-hidden border-b border-rule2 bg-card px-3">
      <span className={`tag tnum flex-none ${tagCount > 0 ? "tag-warn" : "tag-ok"}`}>
        {tagCount > 0 ? t.badLeft(tagCount) : t.allChecked}
      </span>
      <button
        onClick={onNextBad}
        disabled={badCount === 0}
        title={t.nextBadHint}
        aria-label={t.nextBad}
        className="btn btn-quiet btn-sm flex-none"
      >
        <span className="@max-[560px]:hidden">{t.nextBad}</span>
        <ArrowRight size={14} className="hidden @max-[560px]:block" />
        <kbd className="@max-[560px]:hidden">n</kbd>
      </button>
      {totalNeed > 0 && !quickOpen && (
        <button
          data-testid="quick-start"
          onClick={onQuick}
          title={t.qrStartHint}
          aria-label={t.qrStart(totalNeed)}
          className="btn btn-primary btn-sm tnum flex-none"
        >
          <Play size={13} weight="fill" />
          <span className="@max-[440px]:hidden">{t.qrStart(totalNeed)}</span>
          <span className="hidden @max-[440px]:inline">{totalNeed}</span>
        </button>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden whitespace-nowrap">
        {alarmCount > 0 && (
          <button
            data-links-badge
            onClick={onFirstBreak}
            title={t.linksBadgeHint(alarmCount)}
            className="tag tag-shu tnum flex-none cursor-pointer"
          >
            <LinkBreak size={13} weight="bold" />
            {noGlyph(t.linksBadge(alarmCount))}
          </button>
        )}
        {rowLink === "exact" || rowLink === "inferred" || rowLink === "estimated" ? (
          <span className="truncate text-t12 text-ink3 @max-[640px]:hidden">
            {rowLink === "exact" ? t.rowLinkExact : rowLink === "inferred" ? t.rowLinkInferred : t.rowLinkEstimated}
          </span>
        ) : rowLink ? (
          <span role="status" className="truncate text-t12 text-ink3 @max-[640px]:hidden">
            {rowLink === "unavailable" ? t.rowLinkUnavailable : t.rowLinkLoading}
          </span>
        ) : null}
        {/* Trạng thái autosave: người dùng vừa mất công soát vì tưởng đã lưu, nên nói rõ ra. */}
        {saveState !== "idle" && (
          <span
            title={saveState === "saving" ? t.saveSaving : saveState === "saved" ? t.saveSaved : t.saveFailed}
            className={`flex flex-none items-center gap-1 text-t12 ${saveState === "error" ? "font-bold text-danger" : "text-ink3"}`}
          >
            {saveState === "saving" && <CircleNotch size={12} className="animate-spin motion-reduce:animate-none" />}
            {saveState === "saved" && <Check size={12} />}
            {saveState === "error" && <Warning size={12} />}
            <span className="@max-[520px]:hidden">
              {saveState === "saving" ? t.saveSaving : saveState === "saved" ? t.saveSaved : t.saveFailed}
            </span>
          </span>
        )}
      </div>

      <span aria-hidden className="mx-0.5 h-4 w-px flex-none bg-rule" />
      <button
        onClick={onUndo}
        disabled={undoCount === 0}
        title={`${t.undoEditLabel} (Ctrl+Z)`}
        aria-label={t.undoEditLabel}
        className="btn btn-ghost btn-sm btn-icon flex-none"
      >
        <ArrowUUpLeft size={16} />
      </button>
      <button
        onClick={onRedo}
        disabled={redoCount === 0}
        title={`${t.redoEditLabel} (Ctrl+Y)`}
        aria-label={t.redoEditLabel}
        className="btn btn-ghost btn-sm btn-icon flex-none"
      >
        <ArrowUUpRight size={16} />
      </button>
      {/* 13.5px: E2E đo đúng cỡ chữ nút này để kiểm tuỳ chọn cỡ chữ */}
      <button
        data-tour="export"
        onClick={onExport}
        disabled={exportDisabled}
        aria-label={t.exportBtn}
        className={`btn ${totalNeed === 0 ? "btn-primary" : "btn-quiet"} ml-1 flex-none text-[length:calc(13.5px*var(--fs))]`}
      >
        <DownloadSimple size={16} />
        <span className="@max-[560px]:hidden">{t.exportBtn}</span>
      </button>
    </div>
  );
}
