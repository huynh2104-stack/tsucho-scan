"use client";

/**
 * Khung giữa khi mặt sổ đang xem CHƯA SẴN SÀNG: còn được máy xử lý nền, hoặc nhập hỏng.
 * Không vẽ `<img>` (ảnh chưa tồn tại, sẽ ra biểu tượng ảnh hỏng); xong là danh sách tự
 * cập nhật rồi khung xem bình thường hiện ra.
 */

import { useT } from "@/lib/i18n";
import type { Sheet } from "@/lib/api";
import { CircleNotch, Trash, WarningCircle } from "@/components/ui/icons";

export default function SheetBusy({ sheet, onDelete }: { sheet: Sheet; onDelete: () => void }) {
  const { t } = useT();
  const failed = sheet.status === "failed";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {failed ? (
        <>
          <WarningCircle size={32} className="text-shuonink" />
          <p className="text-t16 font-bold text-shuonink">{t.stImportFailed}</p>
          <p className="max-w-xs text-t13 text-balance text-shellink2 [word-break:auto-phrase]">{t.importFailedMsg(sheet.error ?? "")}</p>
          <button type="button" onClick={onDelete} className="btn btn-danger mt-1">
            <Trash size={16} />
            {t.deleteSheet}
          </button>
        </>
      ) : (
        <>
          <CircleNotch size={32} className="animate-spin text-shellink2 motion-reduce:animate-none" aria-hidden />
          <p className="text-t16 font-bold text-shellink">{t.sheetProcessing}</p>
          <p className="max-w-xs text-t13 text-balance text-shellink2 [word-break:auto-phrase]">{t.sheetProcessingHint}</p>
        </>
      )}
    </div>
  );
}
