"use client";

/**
 * Thông báo nhỏ ở đáy màn hình, có thể kèm nút (task 3.3: «Đã nhớ … Áp dụng cho N dòng giống vậy?»).
 *
 * Tự đóng sau `ms` mili giây — nhưng KHÔNG đóng khi con trỏ đang ở trên nó hoặc nút đang giữ focus, để người đọc chậm
 * không bị mất cơ hội bấm. Không chiếm chỗ trong bố cục (cố định), nên không đẩy bảng đúng lúc đang nhấn chuột.
 */

import { useEffect, useRef, useState } from "react";

import { X } from "@/components/ui/icons";
import { useT } from "@/lib/i18n";

export type ToastData = {
  id: number;
  text: string;
  actions?: { label: string; onClick: () => void }[];
  ms?: number;
};

export default function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  const { t } = useT();
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast || hover) return;
    timer.current = setTimeout(onClose, toast.ms ?? 9000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast, hover, onClose]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      data-testid="toast"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="fixed bottom-16 left-1/2 z-[65] flex w-max max-w-[min(92vw,640px)] -translate-x-1/2 animate-[sheetIn_160ms_cubic-bezier(0.16,1,0.3,1)_both] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-card py-2 pl-4 pr-2 text-t14 shadow-lift motion-reduce:animate-none lg:bottom-10"
    >
      <span className="min-w-0 flex-1 break-words">{toast.text}</span>
      {toast.actions?.map((a) => (
        <button
          key={a.label}
          data-toast-action={a.label}
          onClick={() => {
            a.onClick();
            onClose();
          }}
          className="btn btn-quiet btn-sm flex-none"
        >
          {a.label}
        </button>
      ))}
      <button onClick={onClose} aria-label={t.toastClose} title={t.toastClose} className="btn btn-ghost btn-sm btn-icon flex-none">
        <X size={14} />
      </button>
    </div>
  );
}
