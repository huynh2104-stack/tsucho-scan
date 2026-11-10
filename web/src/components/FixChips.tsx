"use client";

/**
 * Các nút «sửa một chạm» của thẻ Soát nhanh (task 3.2): cùng danh sách phương án với thanh `FixBar` ở bảng
 * (`suggestFixes` trong lib/review.ts) và cùng kiểu nút. Không có phương án thì không vẽ gì.
 */

import { fixLabel } from "@/components/FixBar";
import { Lightbulb } from "@/components/ui/icons";
import { useT } from "@/lib/i18n";
import type { Fix } from "@/lib/review";

export default function FixChips({
  fixes,
  onApply,
  live = true,
}: {
  fixes: Fix[];
  onApply: (fix: Fix) => void;
  /** Thẻ đang trượt đi thì chỉ còn là hình: không mang các mốc của thẻ thật. */
  live?: boolean;
}) {
  const { t } = useT();
  if (fixes.length === 0) return null;
  return (
    <div data-testid={live ? "quick-fixes" : undefined} className="flex flex-col items-start gap-1.5">
      <span className="text-t12 text-ink3">{t.fixesLabel}</span>
      {fixes.map((f) => (
        <button
          key={f.kind}
          data-fix={live ? f.kind : undefined}
          onClick={() => onApply(f)}
          title={t.fixesHint}
          className="btn btn-quiet btn-sm max-w-full"
        >
          <Lightbulb size={14} className="flex-none text-accent" />
          <span className="truncate">{fixLabel(t, f)}</span>
        </button>
      ))}
    </div>
  );
}
