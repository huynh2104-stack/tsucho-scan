"use client";

/**
 * Thông báo nhỏ ở đáy màn hình, có thể kèm nút (task 3.3: «Đã nhớ … Áp dụng cho N dòng giống vậy?»).
 *
 * Tự đóng sau `ms` mili giây — nhưng KHÔNG đóng khi con trỏ đang ở trên nó hoặc nút đang giữ focus, để người đọc chậm
 * không bị mất cơ hội bấm. Không chiếm chỗ trong bố cục (cố định), nên không đẩy bảng đúng lúc đang nhấn chuột.
 */

import { useEffect, useRef, useState } from "react";

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
      role="status"
      data-testid="toast"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="fixed bottom-16 left-1/2 z-[65] flex max-w-[min(92vw,640px)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-rule bg-card px-4 py-2.5 text-[13.5px] shadow-2xl lg:bottom-6"
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
          className="flex-none rounded-lg border border-accent bg-accentpale px-3 py-1 text-[13px] font-semibold text-accent hover:bg-accent hover:text-accentink"
        >
          {a.label}
        </button>
      ))}
      <button
        onClick={onClose}
        aria-label={t.toastClose}
        title={t.toastClose}
        className="flex-none rounded px-1.5 text-[15px] leading-none text-ink3 hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
