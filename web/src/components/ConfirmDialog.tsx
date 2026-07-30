"use client";

/**
 * Hộp xác nhận cho thao tác KHÔNG lấy lại được (hoặc mất công làm lại).
 *
 * Dùng cho: về ảnh gốc sau khi đã chỉnh, xoá mặt sổ, xoá dòng. Bấm lỡ tay một
 * cái mà mất cả buổi chỉnh ảnh thì rất khó chịu — thà hỏi thêm một lần.
 */

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";

export default function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  /** Dòng cảnh báo đậm hơn — vd mặt sổ này đã có kết quả quét. */
  warning?: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Enter = đồng ý, Esc = huỷ. Nút đồng ý nhận focus để bấm Enter được ngay.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-rule bg-card shadow-2xl"
      >
        <div className="flex flex-col gap-2 px-5 py-4">
          <h2 id="cf-title" className="text-[15px] font-bold">
            {title}
          </h2>
          <p className="text-[13px] leading-relaxed text-ink2">{message}</p>
          {warning && (
            <p className="rounded-lg border border-warnedge bg-warnbg px-2.5 py-1.5 text-[12.5px] font-medium text-warnink">
              {warning}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-rule bg-card2 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-rule px-3.5 py-1.5 text-[13.5px] text-ink2 hover:border-accentmid hover:text-ink"
          >
            {t.cancel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-lg border px-3.5 py-1.5 text-[13.5px] font-semibold ${
              danger
                ? "border-danger bg-danger text-white hover:brightness-110"
                : "border-accent bg-accent text-accentink hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
