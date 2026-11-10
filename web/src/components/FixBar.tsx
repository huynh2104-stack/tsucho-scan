"use client";

/**
 * Nội dung「vì sao dòng này vàng + sửa một chạm」: một câu giải thích bằng ngôn ngữ của người dùng (chuỗi tiếng Nhật gốc của
 * máy nằm trong tooltip của cột 確認メモ) và tối đa 3 nút gợi ý sửa, cho dòng đang chọn nếu dòng đó cần soát.
 *
 * Chỉ là PHẦN RUỘT: khung nằm ở thanh chân sổ của ReviewPane, CAO CỐ ĐỊNH và luôn có mặt, hiện thứ này thay cho các nút cột
 * phụ. Thanh mà lúc có lúc không sẽ đẩy cả bảng lên xuống đúng lúc người dùng đang nhấn chuột.
 */

import { Lightbulb, Warning } from "@/components/ui/icons";
import { useT, type Dict } from "@/lib/i18n";
import type { Fix } from "@/lib/review";

const yen = (v: number) => v.toLocaleString("en-US");

/** Nhãn của một nút gợi ý sửa — dùng chung với thẻ «Soát nhanh». */
export function fixLabel(t: Dict, f: Fix): string {
  switch (f.kind) {
    case "swap":
      return t.fixSwap;
    case "balance":
      return `${t.colBal} → ${yen(f.value)}`;
    case "amount":
      return `${f.field === "amount_out" ? t.colOut : t.colIn} → ${yen(f.value)}`;
    case "addrow":
      return f.side === "out" ? t.fixAddOut(yen(f.amount)) : t.fixAddIn(yen(f.amount));
    case "note":
      return t.fixAsNote;
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
    <div className="flex min-w-0 flex-1 items-center gap-2 text-t13">
      <Warning size={15} className="flex-none text-warnink" />
      <span className="max-w-[64%] flex-none truncate font-bold text-warnink" title={explain.join(" · ")}>
        {explain.join(" · ")}
      </span>
      <span className="min-w-0 flex-1" />
      {fixes.length > 0 && (
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="flex-none text-t12 text-ink3 @max-[820px]/ledger:hidden">{t.fixesLabel}</span>
          {fixes.map((f) => (
            <button
              key={f.kind}
              data-fix={f.kind}
              onClick={() => onApply(f)}
              title={t.fixesHint}
              className="btn btn-quiet btn-sm flex-none"
            >
              <Lightbulb size={14} className="text-accent" />
              {fixLabel(t, f)}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
