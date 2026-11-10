"use client";

/**
 * Thanh trạng thái cuối màn hình, đọc như thanh dưới của Excel: bên trái là số đếm của cả hồ sơ, bên phải là giới hạn
 * của công cụ. Câu giới hạn KHÔNG BAO GIỜ được giấu (WEB_PLAN §7.4-5): hẹp thì cắt và để đủ chữ trong `title`.
 */

import { useT } from "@/lib/i18n";

export default function StatusBar({ pages, rows }: { pages: number; rows: number }) {
  const { t } = useT();
  return (
    <footer className="flex flex-none flex-col gap-y-1 border-t border-rule bg-card2 px-3 py-1 text-t12 leading-snug text-ink2 lg:h-7 lg:flex-row lg:items-center lg:gap-x-4 lg:py-0">
      <div className="flex flex-none items-center gap-3 whitespace-nowrap">
        <span className="tnum">{t.totalSheets(pages)}</span>
        {rows > 0 && <span className="tnum">{t.statusRows(rows)}</span>}
      </div>
      <p title={t.caveat} className="min-w-0 flex-1 lg:truncate lg:text-right">
        {t.caveat}
      </p>
    </footer>
  );
}
