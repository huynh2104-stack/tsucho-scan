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
    <div className="mt-1.5 h-0.5 overflow-hidden bg-rule">
      <div
        className={`h-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          pulse ? "animate-pulse motion-reduce:animate-none" : ""
        }`}
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
    <div className="mb-2 ml-3.5 flex flex-col gap-2 px-1.5" role="status" aria-live="polite" data-import-progress>
      {uploads.map((u) => (
        <div key={u.key}>
          {/* Cột trang hẹp: tên và tiến độ mỗi thứ một dòng, đặt cạnh nhau thì tên chỉ còn vài chữ */}
          <div className="text-t12 leading-snug">
            <div className="truncate font-bold" title={u.name}>
              {u.name}
            </div>
            <div className="tnum text-ink2">{u.pct >= 100 ? t.uploadPreparing : t.uploadingFile(u.pct)}</div>
          </div>
          <Bar pct={u.pct} pulse={u.pct >= 100} />
        </div>
      ))}
      {working && (
        <div>
          <div className="text-t12 leading-snug">
            <div className="tnum font-bold">{t.importProgress(done, total)}</div>
            <div className="truncate text-ink2">{stageLabel}</div>
          </div>
          <Bar pct={(done / total) * 100} />
        </div>
      )}
    </div>
  );
}
