"use client";

/**
 * Khu kéo thả — nằm ở ĐẦU cột trái, nơi luồng làm việc bắt đầu.
 *
 * Đặt ở đây thay vì giữa trang vì nó phải luôn dùng được: thêm mặt sổ lúc nào
 * cũng được, kể cả khi đang xem kết quả.
 */

import { useRef } from "react";
import { useT } from "@/lib/i18n";

export default function DropZone({
  busy,
  onFiles,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="p-3">
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-rule bg-card2 px-3 py-5 text-center transition-colors hover:border-accent hover:bg-accentpale/40 disabled:opacity-50"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
          aria-hidden
        >
          <path d="M12 15.5V4m0 0L7.8 8.2M12 4l4.2 4.2" />
          <path d="M3.5 14.5v3.7A2.3 2.3 0 0 0 5.8 20.5h12.4a2.3 2.3 0 0 0 2.3-2.3v-3.7" />
        </svg>
        <span className="text-[13.5px] font-semibold leading-snug">
          {t.dropTitle}
        </span>
        <span className="text-[11px] leading-snug text-ink3">{t.dropHint}</span>
      </button>

      <input
        ref={input}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
