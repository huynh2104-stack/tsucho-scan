"use client";

/**
 * Các nút «sửa một chạm» của thẻ Soát nhanh (task 3.2): cùng danh sách phương án với thanh `FixBar` ở bảng
 * (`suggestFixes` trong lib/review.ts), nhưng nút to hơn cho thẻ chữ lớn. Không có phương án thì không vẽ gì.
 */

import { fixLabel } from "@/components/FixBar";
import { useT } from "@/lib/i18n";
import type { Fix } from "@/lib/review";

export default function FixChips({ fixes, onApply }: { fixes: Fix[]; onApply: (fix: Fix) => void }) {
  const { t } = useT();
  if (fixes.length === 0) return null;
  return (
    <div data-testid="quick-fixes" className="flex flex-wrap items-center gap-2">
      <span className="text-[length:calc(13px*var(--fs))] text-ink3">{t.fixesLabel}</span>
      {fixes.map((f) => (
        <button
          key={f.kind}
          data-fix={f.kind}
          onClick={() => onApply(f)}
          title={t.fixesHint}
          className="rounded-lg border border-accent/50 bg-accentpale px-3 py-1.5 text-[length:calc(14px*var(--fs))] font-semibold text-accent hover:bg-accent hover:text-accentink"
        >
          {fixLabel(t, f)}
        </button>
      ))}
    </div>
  );
}
