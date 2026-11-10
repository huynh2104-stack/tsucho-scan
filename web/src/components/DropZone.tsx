"use client";

/**
 * Hai lối thêm file, dùng chung MỘT ô chọn file (E2E tìm `input[type=file]` phải ra đúng một phần tử):
 *   • `DropZone`: nút 取込 gọn ở đầu cột trang, phải luôn dùng được: thêm mặt sổ lúc nào cũng được, kể cả khi đang
 *     xem kết quả. Thả file thì cả trang đã nhận (page.tsx), nút này chỉ cần trông như chỗ thả.
 *   • `BenchDrop`: lần đầu chưa có mặt sổ nào, khung ảnh là chỗ thả lớn kèm lời mời dùng sổ mẫu.
 */

import type { RefObject } from "react";
import { useT } from "@/lib/i18n";
import { UploadSimple } from "@/components/ui/icons";

export default function DropZone({
  busy,
  onFiles,
  inputRef,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useT();

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={`${t.dropTitle}\n${t.dropHint}`}
        className="btn btn-quiet min-h-[calc(32px*var(--fs))] w-full border-dashed font-bold hover:border-solid max-lg:min-h-10"
      >
        <UploadSimple size={16} />
        {t.addFiles}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}

export function BenchDrop({
  busy,
  onPick,
  onSample,
}: {
  busy: boolean;
  onPick: () => void;
  onSample: () => void;
}) {
  const { t } = useT();

  return (
    /* Canh giữa bằng m-auto chứ không justify-center: màn thấp mà cuộn thì justify-center cắt mất phần đầu */
    <div className="thin-scroll flex h-full overflow-y-auto p-6 text-center">
      <div className="m-auto flex w-full max-w-[440px] flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center gap-3 rounded-md border border-dashed border-shellink2/50 px-6 py-10">
          <UploadSimple size={32} className="text-shellink2" />
          {/* Màn hình cảm ứng không có gì để kéo thả */}
          <p className="text-t16 font-bold leading-normal text-balance text-shellink [word-break:auto-phrase]">
            <span className="max-lg:hidden">{t.benchDropTitle}</span>
            <span className="lg:hidden">{t.benchPickTitle}</span>
          </p>
          <p className="text-t12 leading-normal text-balance text-shellink2 [word-break:auto-phrase]">{t.dropHint}</p>
          <button type="button" onClick={onPick} className="btn btn-quiet mt-2 max-lg:min-h-10">
            {t.chooseFile}
          </button>
        </div>

        <div className="flex w-full flex-col items-center gap-2">
          <button type="button" onClick={onSample} disabled={busy} className="btn btn-primary max-lg:min-h-10">
            {t.trySample}
          </button>
          <p className="text-t12 leading-normal text-balance text-shellink2 [word-break:auto-phrase]">{t.trySampleHint}</p>
        </div>
      </div>
    </div>
  );
}
