"use client";

/**
 * Khung giữa khi mặt sổ đang xem CHƯA SẴN SÀNG: còn được máy xử lý nền, hoặc nhập hỏng.
 * Không vẽ `<img>` (ảnh chưa tồn tại, sẽ ra biểu tượng ảnh hỏng); xong là danh sách tự
 * cập nhật rồi khung xem bình thường hiện ra.
 */

import { useT } from "@/lib/i18n";
import type { Sheet } from "@/lib/api";

export default function SheetBusy({ sheet, onDelete }: { sheet: Sheet; onDelete: () => void }) {
  const { t } = useT();
  const failed = sheet.status === "failed";
  return (
    <div className="canvas-bg flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {failed ? (
        <>
          <p className="text-[15px] font-semibold text-danger">{t.stImportFailed}</p>
          <p className="max-w-xs text-[12.5px] text-ink2">{t.importFailedMsg(sheet.error ?? "")}</p>
          <button
            onClick={onDelete}
            className="rounded-lg border border-danger/50 px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger/10"
          >
            {t.deleteSheet}
          </button>
        </>
      ) : (
        <>
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-rule border-t-accent" aria-hidden />
          <p className="text-[15px] font-semibold text-ink2">{t.sheetProcessing}</p>
          <p className="max-w-xs text-[12.5px] text-ink3">{t.sheetProcessingHint}</p>
        </>
      )}
    </div>
  );
}
