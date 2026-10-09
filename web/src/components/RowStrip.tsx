"use client";

/**
 * Dải ảnh PHÓNG TO của một dòng (task 3.2): đúng phần ảnh sổ chứa dòng đang soát, nới một dòng mỗi phía, để mắt
 * đối chiếu ngay trên ô thay vì dò cả trang ở khung giữa.
 *
 * Cắt bằng CSS (không gọi máy chủ, không tạo ảnh mới): một khung có tỉ lệ đúng bằng vùng cắt, bên trong là CHÍNH
 * ảnh mặt sổ phóng lên và dời sao cho vùng đó nằm vừa khung. Vùng cắt tính ở `lib/quickreview.ts` (`stripRect`, có test).
 *
 * Trang chụp nghiêng thì dòng chữ cũng nghiêng: ảnh được nghiêng NGƯỢC lại (`skewY(-góc)`) quanh TÂM TỜ GIẤY — đúng
 * tâm mà `api/rowmap.py` đo góc, và đúng tâm mà vệt đỏ ở khung giữa (SheetViewer) xoay quanh — nên chữ nằm ngang
 * và dải của dòng khớp. Viền liền = dải khớp theo nội dung; nét đứt = ước lượng (và ghi rõ chữ «vị trí ước lượng»).
 *
 * Toạ độ dải là của ảnh HIỆN TẠI: ảnh đã xoay/cắt/chỉnh sau khi quét thì dải sai, nên ẩn dải và cảnh báo «kết quả cũ».
 */

import { sheetImage, type RowBands, type Sheet } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { stripRect, stripSegments } from "@/lib/quickreview";

export default function RowStrip({
  wsId,
  sheet,
  bands,
  bandsState,
  index,
  stale,
}: {
  wsId: string;
  sheet: Sheet;
  /** Dải của mặt sổ ĐANG XEM; null khi chưa tải xong hoặc không xác định được. */
  bands: RowBands | null;
  bandsState: "loading" | "unavailable" | "ready";
  /** Thứ tự của dòng trong cả mặt sổ (chỉ số dải). */
  index: number;
  /** Ảnh đã bị xoay/cắt/chỉnh sau khi quét. */
  stale: boolean;
}) {
  const { t } = useT();

  if (stale) {
    return (
      <div data-testid="quick-strip-stale" className="rounded-lg border border-warnedge bg-warnbg px-3 py-2 text-[length:calc(13px*var(--fs))] text-warnink">
        <b className="font-semibold">⚠ {t.staleTitle}</b> <span>{t.staleMsg}</span>
      </div>
    );
  }
  const rect = bandsState === "ready" ? stripRect(bands, index) : null;
  if (!rect) {
    return (
      <div
        data-testid="quick-strip-empty"
        role="status"
        className="flex h-24 items-center justify-center rounded-lg border border-dashed border-rule bg-card2 px-3 text-center text-[length:calc(13px*var(--fs))] text-ink3"
      >
        {bandsState === "loading" ? t.rowLinkLoading : t.rowLinkUnavailable}
      </div>
    );
  }

  const h = rect.cy1 - rect.cy0;
  const solid = rect.exact;
  // Tờ sổ rộng hơn cột kết quả: cắt thành 1–3 đoạn xếp chồng (xem `stripSegments`) để chữ thật sự được phóng to
  const segs = stripSegments(rect, sheet.width, sheet.height);
  return (
    <div data-testid="quick-strip" data-exact={solid ? "1" : "0"} data-segments={segs.length} className="flex flex-col gap-1">
      {segs.map((seg, i) => {
        const w = seg.x1 - seg.x0;
        return (
          <div
            key={i}
            data-seg={i}
            className="relative w-full overflow-hidden rounded-lg border border-rule bg-white"
            style={{ aspectRatio: `${w * sheet.width} / ${h * sheet.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sheetImage(wsId, sheet)}
              crossOrigin="use-credentials"
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                width: `${100 / w}%`,
                left: `${-(seg.x0 / w) * 100}%`,
                top: `${-(rect.cy0 / h) * 100}%`,
                transform: rect.skew ? `skewY(${-rect.skew}deg)` : undefined,
                transformOrigin: `${((rect.cx0 + rect.cx1) / 2) * 100}% 50%`,
              }}
            />
            {/* Dải của chính dòng này */}
            <div
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: `${((rect.y0 - rect.cy0) / h) * 100}%`,
                height: `${((rect.y1 - rect.y0) / h) * 100}%`,
                border: `2px ${solid ? "solid" : "dashed"} var(--danger)`,
                background: `color-mix(in srgb, var(--danger) ${solid ? 8 : 4}%, transparent)`,
              }}
            />
            {!solid && i === 0 && (
              <span
                data-testid="quick-strip-estimated"
                className="absolute right-1.5 top-1.5 rounded bg-card/90 px-1.5 py-0.5 text-[length:calc(11px*var(--fs))] font-medium text-ink3"
              >
                {t.qrEstimated}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
