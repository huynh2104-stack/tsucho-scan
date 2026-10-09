"use client";

/**
 * Phản hồi TỨC THÌ khi nhập file — đặt ngay trên danh sách mặt sổ.
 *
 * Hai giai đoạn người dùng phải thấy, vì mỗi giai đoạn có thể mất vài giây:
 *   1. đang TẢI LÊN (thanh theo số byte đã gửi) — hiện ngay lúc thả file, trước cả khi máy
 *      chủ trả lời;
 *   2. máy đang XỬ LÝ NỀN (tách trang PDF, kiểm hướng, cắt gọn) — "k/n trang".
 * Trước đây cả hai là một khoảng im lặng: nút chỉ mờ đi và không có thanh nào.
 */

import { useT } from "@/lib/i18n";

export type PendingUpload = { key: string; name: string; size: number; pct: number };

function Bar({ pct, pulse = false }: { pct: number; pulse?: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule2">
      <div
        className={`h-full rounded-full bg-accent transition-[width] duration-300 ${pulse ? "animate-pulse" : ""}`}
        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export default function ImportProgress({
  uploads,
  done,
  total,
  stage,
}: {
  uploads: PendingUpload[];
  /** Số mặt sổ đã xử lý xong trong đợt nhập hiện tại. */
  done: number;
  /** Tổng số mặt sổ của đợt nhập (0 = không có gì đang xử lý). */
  total: number;
  /** Trạng thái của mặt sổ đang được làm dở đầu tiên. */
  stage?: string;
}) {
  const { t } = useT();
  const working = total > 0 && done < total;
  if (uploads.length === 0 && !working) return null;

  const stageLabel =
    stage === "rendering" ? t.stRendering : stage === "analyzing" ? t.stAnalyzing : t.stQueued;

  return (
    <div className="mx-2 mb-2 flex flex-col gap-1.5" role="status" aria-live="polite" data-import-progress>
      {uploads.map((u) => (
        <div key={u.key} className="rounded-lg border border-accent/40 bg-accentpale/40 px-2.5 py-2">
          <div className="flex items-start gap-2 text-[length:calc(11.5px*var(--fs))]">
            <span className="min-w-0 flex-1 break-all font-semibold leading-snug">{u.name}</span>
            <span className="tnum flex-none text-ink2">
              {u.pct >= 100 ? t.uploadPreparing : t.uploadingFile(u.pct)}
            </span>
          </div>
          <Bar pct={u.pct} pulse={u.pct >= 100} />
        </div>
      ))}
      {working && (
        <div className="rounded-lg border border-accent/40 bg-accentpale/40 px-2.5 py-2">
          <div className="text-[length:calc(11.5px*var(--fs))] leading-snug">
            <div className="tnum font-semibold">{t.importProgress(done, total)}</div>
            <div className="text-ink2">{stageLabel}</div>
          </div>
          <Bar pct={(done / total) * 100} />
        </div>
      )}
    </div>
  );
}
