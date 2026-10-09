"use client";

/**
 * Thanh「vì sao dòng này vàng + sửa một chạm」, nằm ngay dưới thanh công cụ của khung kết quả.
 *
 * Hiện cho dòng đang chọn nếu dòng đó cần soát: một câu giải thích bằng ngôn ngữ của người dùng
 * (chuỗi tiếng Nhật gốc của máy nằm trong tooltip của cột 確認メモ) và tối đa 3 nút gợi ý sửa.
 *
 * CHIỀU CAO CỐ ĐỊNH, kể cả khi không có gì để hiện: thanh mà lúc có lúc không sẽ đẩy cả bảng
 * lên xuống đúng lúc người dùng đang nhấn chuột (bài học từ lỗi bấm trượt của thanh công cụ).
 * Lúc rảnh nó nhắc các phím tắt — giao diện chưa có chỗ nào ghi chúng.
 */

import { useT, type Dict } from "@/lib/i18n";
import type { Fix } from "@/lib/review";

const yen = (v: number) => v.toLocaleString("en-US");

/** Nhãn của một nút gợi ý sửa — dùng chung với thẻ «Soát nhanh». */
export function fixLabel(t: Dict, f: Fix): string {
  switch (f.kind) {
    case "swap":
      return t.fixSwap;
    case "balance":
      return `残高 → ${yen(f.value)}`;
    case "amount":
      return `${f.field === "amount_out" ? "出金" : "入金"} → ${yen(f.value)}`;
    case "addrow":
      return f.side === "out" ? t.fixAddOut(yen(f.amount)) : t.fixAddIn(yen(f.amount));
  }
}

export default function FixBar({
  explain,
  fixes,
  onApply,
}: {
  /** Các lý do chưa giải quyết của dòng đang chọn, đã dịch; rỗng = dòng không cần soát. */
  explain: string[];
  fixes: Fix[];
  onApply: (fix: Fix) => void;
}) {
  const { t } = useT();

  return (
    <div
      data-fixbar
      className="flex h-9 flex-none items-center gap-2 overflow-hidden whitespace-nowrap border-b border-rule2 bg-card2 px-3 text-[11.5px]"
    >
      {explain.length === 0 ? (
        <span className="truncate text-ink3">{t.inspectorHint}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-medium text-warnink" title={explain.join(" · ")}>
            ⚠ {explain.join(" · ")}
          </span>
          {fixes.length > 0 && (
            <>
              <span className="flex-none text-ink3">{t.fixesLabel}</span>
              {fixes.map((f) => (
                <button
                  key={f.kind}
                  data-fix={f.kind}
                  onClick={() => onApply(f)}
                  title={t.fixesHint}
                  className="flex-none rounded-md border border-accent/50 bg-accentpale px-2 py-1 text-[11.5px] font-semibold text-accent hover:bg-accent hover:text-accentink"
                >
                  {fixLabel(t, f)}
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
