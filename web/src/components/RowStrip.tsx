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

import { Warning } from "@/components/ui/icons";
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
  live = true,
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
  /** Thẻ đang trượt đi thì chỉ còn là hình: không mang các mốc của thẻ thật. */
  live?: boolean;
}) {
  const { t } = useT();

  if (stale) {
    return (
      <div
        data-testid={live ? "quick-strip-stale" : undefined}
        className="flex items-start gap-2 bg-warnbg px-3 py-2 text-t13 text-warnink"
      >
        <Warning size={15} className="mt-0.5 flex-none" />
        <p>
          <b>{t.staleTitle}</b> <span>{t.staleMsg}</span>
        </p>
      </div>
    );
  }
  const rect = bandsState === "ready" ? stripRect(bands, index) : null;
  if (!rect) {
    return (
      <div
        data-testid={live ? "quick-strip-empty" : undefined}
        role="status"
        className="flex h-24 items-center justify-center bg-card2 px-3 text-center text-t13 text-ink3"
      >
        {bandsState === "loading" ? t.rowLinkLoading : t.rowLinkUnavailable}
      </div>
    );
  }

  // Giữ nửa dòng kề mỗi phía: vẫn định vị được mà dải thấp hẳn đi, nên phép tính và ô nhập còn nằm trong một màn hình
  const top = rect.cy0 + (rect.y0 - rect.cy0) / 2;
  const h = rect.cy1 - (rect.cy1 - rect.y1) / 2 - top;
  const solid = rect.exact;
  // Tờ sổ rộng hơn cột kết quả: cắt thành 1–3 đoạn xếp chồng (xem `stripSegments`) để chữ thật sự được phóng to
  const segs = stripSegments(rect, sheet.width, sheet.height);
  return (
    <div
      data-testid={live ? "quick-strip" : undefined}
      data-exact={solid ? "1" : "0"}
      data-segments={segs.length}
      className="flex flex-col gap-1 [@media(max-height:820px)_and_(min-width:1024px)]:mx-auto [@media(max-height:820px)_and_(min-width:1024px)]:w-[76%]"
    >
      {segs.map((seg, i) => {
        const w = seg.x1 - seg.x0;
        return (
          <div
            key={i}
            data-seg={i}
            /* Khung vẽ bằng outline, KHÔNG dùng border: `top` của ảnh là phần trăm rất lớn (tới hơn 1000%) tính theo khung trong
               của ô. Viền 1px làm khung trong hụt 2px, nhân lên thành hơn 20px: ảnh tụt nửa dòng so với dải, càng cuối trang càng lệch. */
            className="relative w-full overflow-hidden rounded-md bg-white outline outline-1 -outline-offset-1 outline-rule"
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
                top: `${-(top / h) * 100}%`,
                transform: rect.skew ? `skewY(${-rect.skew}deg)` : undefined,
                transformOrigin: `${rect.ox * 100}% 50%`,
              }}
            />
            {/* Dải của chính dòng này */}
            <div
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: `${((rect.y0 - top) / h) * 100}%`,
                height: `${((rect.y1 - rect.y0) / h) * 100}%`,
                border: `2px ${solid ? "solid" : "dashed"} var(--danger)`,
                background: `color-mix(in srgb, var(--danger) ${solid ? 8 : 4}%, transparent)`,
              }}
            />
          </div>
        );
      })}
      {/* Ghi nhỏ dưới ảnh, không đè lên chữ của sổ: người soát đang đọc đúng chỗ đó */}
      {!solid && (
        <p data-testid={live ? "quick-strip-estimated" : undefined} className="text-right text-t12 text-ink3">
          {t.qrEstimated}
        </p>
      )}
    </div>
  );
}
