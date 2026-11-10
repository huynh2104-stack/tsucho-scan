"use client";

/**
 * Hộp xác nhận cho thao tác KHÔNG lấy lại được (hoặc mất công làm lại).
 *
 * Dùng cho: về ảnh gốc sau khi đã chỉnh, xoá mặt sổ, xoá dòng. Bấm lỡ tay một
 * cái mà mất cả buổi chỉnh ảnh thì rất khó chịu — thà hỏi thêm một lần.
 */

import { useEffect, useRef } from "react";
import DialogFrame from "@/components/ui/DialogFrame";
import { useT } from "@/lib/i18n";

export default function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel,
  danger,
  enterConfirms = true,
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
  /** Mặc định Enter = đồng ý. Thao tác huỷ diệt (xoá cả hồ sơ) đặt false: Enter chỉ huỷ, phải BẤM nút mới xoá. */
  enterConfirms?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Enter = đồng ý, Esc = huỷ. Nút đồng ý nhận focus để bấm Enter được ngay.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (enterConfirms && e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    // Không cho Enter xác nhận thì focus rơi vào nút Huỷ, để lỡ tay gõ Enter cũng chỉ là huỷ.
    (enterConfirms ? confirmRef : cancelRef).current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, enterConfirms, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <DialogFrame role="alertdialog" labelledBy="cf-title" onClose={onCancel} maxWidth={440}>
      <div className="dlg-head">
        <h2 id="cf-title" className="min-w-0 text-t16 font-bold">
          {title}
        </h2>
      </div>
      <div className="dlg-body flex flex-col gap-3">
        <p className="text-t14 leading-[1.7] break-words text-ink2">{message}</p>
        {warning && <p className="rounded-[3px] bg-warnbg px-3 py-2 text-t13 font-bold leading-[1.6] text-warnink">{warning}</p>}
      </div>
      <div className="dlg-foot">
        <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-quiet">
          {t.cancel}
        </button>
        <button ref={confirmRef} type="button" onClick={onConfirm} className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}>
          {confirmLabel}
        </button>
      </div>
    </DialogFrame>
  );
}
