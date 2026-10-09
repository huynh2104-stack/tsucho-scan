"use client";

/**
 * Hộp «Thông tin sổ» (task 2.3): sửa 銀行名 / 店番号 / 口座番号 / 名義 của MỘT khối.
 *
 * Ô tick「áp dụng cho N mặt sổ phía sau chưa có thông tin」bật sẵn khi có mặt sau để điền — sổ không có bìa là
 * chuyện của CẢ bộ sổ, điền một lần cho khỏi phải làm từng mặt. Logic điền nằm ở `lib/bookinfo.ts` (có test); hộp
 * này chỉ thu thập chữ gõ và gọi `onSave`. Mở hộp bằng cách dựng nó ra với `key` riêng cho từng khối: trạng thái
 * ban đầu lấy từ `meta` một lần, không cần effect đồng bộ.
 */

import { useEffect, useRef, useState } from "react";

import type { AccountMeta } from "@/lib/api";
import { META_INPUT_MAX, draftOf, type MetaDraft, type MetaField } from "@/lib/bookinfo";
import { useT } from "@/lib/i18n";

export default function BookInfoDialog({
  meta,
  followers,
  onSave,
  onCancel,
}: {
  meta: AccountMeta;
  /** Số mặt sổ phía sau sẽ được điền nếu tick (0 = không có gì để điền). */
  followers: number;
  onSave: (draft: MetaDraft, propagate: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<MetaDraft>(() => draftOf(meta));
  const [propagate, setPropagate] = useState(true);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  const fields: { key: MetaField; label: string }[] = [
    { key: "bank_name", label: t.biBank },
    { key: "store_no", label: t.biStore },
    { key: "account_no", label: t.biAccount },
    { key: "holder", label: t.biHolder },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="bi-title"
        data-testid="bookinfo-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft, followers > 0 && propagate);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          e.stopPropagation();                  // phím gõ trong hộp không được lọt ra phím tắt của bảng (n, p, Ctrl+Z…)
        }}
        className="w-full max-w-md overflow-hidden rounded-xl border border-rule bg-card shadow-2xl"
      >
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <h2 id="bi-title" className="text-[15px] font-bold">
              {t.bookInfoTitle}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">{t.bookInfoHint}</p>
          </div>

          {fields.map((f, i) => (
            <label key={f.key} className="flex flex-col gap-1 text-[12.5px] font-medium text-ink2">
              {f.label}
              <input
                ref={i === 0 ? first : undefined}
                value={draft[f.key]}
                maxLength={META_INPUT_MAX}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                data-field={f.key}
                className="rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[14px] font-normal text-ink"
              />
            </label>
          ))}

          {followers > 0 ? (
            <label className="flex items-start gap-2 rounded-lg bg-card2 px-3 py-2 text-[12.5px] text-ink2">
              <input
                type="checkbox"
                checked={propagate}
                onChange={(e) => setPropagate(e.target.checked)}
                data-testid="bookinfo-propagate"
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-ink">{t.biApply(followers)}</span>
                <span className="block text-[11.5px] text-ink3">{t.biApplyHint}</span>
              </span>
            </label>
          ) : (
            <p className="text-[11.5px] text-ink3">{t.biApplyNone}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-rule bg-card2 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rule px-3.5 py-1.5 text-[13.5px] text-ink2 hover:border-accentmid hover:text-ink"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            data-testid="bookinfo-save"
            className="rounded-lg border border-accent bg-accent px-3.5 py-1.5 text-[13.5px] font-semibold text-accentink hover:brightness-110"
          >
            {t.biSave}
          </button>
        </div>
      </form>
    </div>
  );
}
