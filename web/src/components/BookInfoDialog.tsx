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

import DialogFrame from "@/components/ui/DialogFrame";
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
    <DialogFrame labelledBy="bi-title" onClose={onCancel} maxWidth={480} testId="bookinfo-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft, followers > 0 && propagate);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          e.stopPropagation();                  // phím gõ trong hộp không được lọt ra phím tắt của bảng (n, p, Ctrl+Z…)
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="dlg-head">
          <h2 id="bi-title" className="text-t16 font-bold">
            {t.bookInfoTitle}
          </h2>
        </div>

        <div className="dlg-body flex flex-col gap-3">
          <p className="text-t13 leading-[1.7] text-ink2">{t.bookInfoHint}</p>

          {fields.map((f, i) => (
            <label key={f.key} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[calc(88px*var(--fs))_minmax(0,1fr)]">
              <span className="text-t13 font-bold text-ink2">{f.label}</span>
              <input
                ref={i === 0 ? first : undefined}
                value={draft[f.key]}
                maxLength={META_INPUT_MAX}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                data-field={f.key}
                className="field"
              />
            </label>
          ))}

          <div className="mt-1 border-t border-rule2 pt-3">
            {followers > 0 ? (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={propagate}
                  onChange={(e) => setPropagate(e.target.checked)}
                  data-testid="bookinfo-propagate"
                  className="mt-[calc(3px*var(--fs))] size-4 flex-none accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-t14 text-ink">{t.biApply(followers)}</span>
                  <span className="block text-t12 leading-[1.6] text-ink3">{t.biApplyHint}</span>
                </span>
              </label>
            ) : (
              <p className="text-t12 text-ink3">{t.biApplyNone}</p>
            )}
          </div>
        </div>

        <div className="dlg-foot">
          <button type="button" onClick={onCancel} className="btn btn-quiet">
            {t.cancel}
          </button>
          <button type="submit" data-testid="bookinfo-save" className="btn btn-primary">
            {t.biSave}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
