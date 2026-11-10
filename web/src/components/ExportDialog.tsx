"use client";

/**
 * Hộp thoại xuất file — thay cho hai nút Excel/CSV bấm là tải ngay.
 *
 * Lý do có hộp thoại: bốn quyết định độc lập (định dạng, phạm vi, cấu trúc,
 * dòng 合計) mà mỗi lần xuất người dùng chọn khác nhau. Nhồi hết thành nút thì
 * thành 8 nút; hỏi một lần thì rõ ràng hơn.
 */

import { useEffect, useState, type ReactNode } from "react";
import DialogFrame from "@/components/ui/DialogFrame";
import { CaretRight, CheckCircle, CircleNotch, DownloadSimple, WarningCircle } from "@/components/ui/icons";
import { hasIssues, type ExportSummary } from "@/lib/exportsummary";
import { useT } from "@/lib/i18n";

export type ExportOpts = {
  format: "xlsx" | "csv";
  scope: "current" | "ticked" | "all";
  structure: "per_sheet" | "per_account" | "merged";
  add_total: boolean;
  name: string;
};

/** Một lựa chọn trong nhóm. Vẫn là nút có aria-pressed (E2E tìm theo vai trò nút), chỉ đổi hình cho giống ô radio. */
function Choice({
  checked,
  onSelect,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className="-mx-2 flex min-h-[calc(30px*var(--fs))] w-[calc(100%+16px)] max-sm:min-h-10 cursor-pointer items-start gap-2.5 rounded-[3px] px-2 py-1 text-left transition-colors duration-100 enabled:hover:bg-card2 enabled:active:bg-card3 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        aria-hidden
        className={`mt-[calc(3px*var(--fs))] flex size-4 flex-none items-center justify-center rounded-full border ${
          checked ? "border-accent" : "border-ink3"
        }`}
      >
        {checked && <span className="size-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-t14 ${checked ? "font-bold" : ""}`}>{title}</span>
        {hint && <span className="block text-t12 leading-[1.5] text-pretty text-ink3">{hint}</span>}
      </span>
    </button>
  );
}

/** Một hàng của biểu mẫu: nhãn cột trái, điều khiển cột phải, ngăn bằng đường kẻ mảnh; màn hẹp thì xếp chồng. */
function FormRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-1 border-t border-rule2 py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[calc(120px*var(--fs))_minmax(0,1fr)]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-t13 font-bold text-ink2 sm:pt-[calc(8px*var(--fs))]">
          {label}
        </label>
      ) : (
        <span className="text-t13 font-bold text-ink2 sm:pt-[calc(5px*var(--fs))]">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function ExportDialog({
  open,
  bookName,
  tickedCount,
  totalCount,
  hasCurrent,
  summary,
  onJump,
  busy,
  onCancel,
  onExport,
}: {
  open: boolean;
  bookName: string;
  tickedCount: number;
  totalCount: number;
  hasCurrent: boolean;
  /** Tóm tắt từng phạm vi xuất (dòng cần soát, chỗ đứt, cặp trùng) — chỉ nhắc, không chặn. */
  summary: Record<ExportOpts["scope"], ExportSummary>;
  /** Bấm một mục trong tóm tắt: đóng hộp và nhảy tới chỗ đó. */
  onJump: (kind: "need" | "break" | "dup", s: ExportSummary) => void;
  busy: boolean;
  onCancel: () => void;
  onExport: (o: ExportOpts) => void;
}) {
  const { t } = useT();
  const [opts, setOpts] = useState<ExportOpts>({
    format: "xlsx",
    scope: "all",
    structure: "per_sheet",
    add_total: false,
    name: bookName,
  });

  useEffect(() => {
    if (open) {
      setOpts((p) => ({
        ...p,
        name: bookName,
        scope: hasCurrent ? p.scope : p.scope === "current" ? "all" : p.scope,
      }));
    }
  }, [open, bookName, hasCurrent]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    if (open) window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onCancel]);

  if (!open) return null;

  const set = <K extends keyof ExportOpts>(k: K, v: ExportOpts[K]) =>
    setOpts((p) => ({ ...p, [k]: v }));

  const sum = summary[opts.scope];
  const issues = hasIssues(sum);
  const items: { kind: "need" | "break" | "dup"; label: string; tip?: string }[] = [];
  if (sum.need > 0) items.push({ kind: "need", label: t.sumNeed(sum.need) });
  if (sum.breaks > 0) items.push({ kind: "break", label: t.sumBreak(sum.breaks) });
  if (sum.dups > 0) items.push({ kind: "dup", label: t.sumDup(sum.dups), tip: t.expDupWarn(sum.dups) });

  return (
    <DialogFrame labelledBy="exp-title" onClose={onCancel} maxWidth={640}>
      <div className="dlg-head">
        <div className="min-w-0">
          <h2 id="exp-title" className="text-t16 font-bold">
            {t.exportTitle}
          </h2>
          <p className="mt-0.5 text-t13 font-normal leading-[1.5] text-ink2">{t.exportSubtitle}</p>
        </div>
      </div>

      {/* Chỉ phần THÂN cuộn: nút Xuất ở chân luôn nằm trong tầm mắt dù hộp cao hơn màn hình (3 cách trình bày + tóm tắt) */}
      <div className="dlg-body">
        {/* Tóm tắt: chỉ NHẮC, không chặn — mỗi mục là liên kết nhảy tới chỗ đó */}
        <FormRow label={t.sumTitle}>
          <div data-export-summary data-issues={issues ? "yes" : "no"}>
            {issues ? (
              <>
                <ul>
                  {items.map((it) => (
                    <li key={it.kind}>
                      <button
                        type="button"
                        data-sum={it.kind}
                        title={it.tip}
                        onClick={() => onJump(it.kind, sum)}
                        className="-mx-2 flex min-h-[calc(30px*var(--fs))] w-[calc(100%+16px)] max-sm:min-h-10 cursor-pointer items-center gap-2 rounded-[3px] px-2 text-left text-t14 font-bold text-warnink transition-colors duration-100 hover:bg-warnbg"
                      >
                        <WarningCircle size={16} aria-hidden className="flex-none" />
                        <span className="min-w-0 flex-1">{it.label}</span>
                        <CaretRight size={12} aria-hidden className="flex-none" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-t12 leading-[1.6] text-ink3">{t.sumHint}</p>
              </>
            ) : (
              <p data-sum-ok className="flex min-h-[calc(30px*var(--fs))] items-center gap-2 text-t14 font-bold text-okink">
                <CheckCircle size={16} weight="fill" aria-hidden className="flex-none" />
                {t.sumOk}
              </p>
            )}
          </div>
        </FormRow>

        <FormRow label={t.expFormat}>
          <div role="group" aria-label={t.expFormat}>
            <Choice
              checked={opts.format === "xlsx"}
              onSelect={() => set("format", "xlsx")}
              title="Excel (.xlsx)"
              hint={t.expXlsxHint}
            />
            <Choice
              checked={opts.format === "csv"}
              onSelect={() => set("format", "csv")}
              title="CSV (.csv)"
              hint={t.expCsvHint}
            />
          </div>
        </FormRow>

        <FormRow label={t.expScope}>
          <div role="group" aria-label={t.expScope}>
            <Choice
              checked={opts.scope === "current"}
              onSelect={() => set("scope", "current")}
              title={t.expScopeCurrent}
              disabled={!hasCurrent}
              hint={hasCurrent ? undefined : t.expScopeCurrentNone}
            />
            <Choice
              checked={opts.scope === "ticked"}
              onSelect={() => set("scope", "ticked")}
              title={t.expScopeTicked(tickedCount)}
              disabled={tickedCount === 0}
            />
            <Choice
              checked={opts.scope === "all"}
              onSelect={() => set("scope", "all")}
              title={t.expScopeAll(totalCount)}
            />
          </div>
        </FormRow>

        {/* CSV chỉ có một bảng nên chữ gợi ý đổi theo định dạng */}
        <FormRow label={t.expStructure}>
          <div role="group" aria-label={t.expStructure}>
            <Choice
              checked={opts.structure === "per_sheet"}
              onSelect={() => set("structure", "per_sheet")}
              title={t.expPerSheet}
              hint={opts.format === "csv" ? t.expPerSheetCsv : t.expPerSheetHint}
            />
            <Choice
              checked={opts.structure === "per_account"}
              onSelect={() => set("structure", "per_account")}
              title={t.expPerAccount}
              hint={opts.format === "csv" ? t.expPerAccountCsv : t.expPerAccountHint}
            />
            <Choice
              checked={opts.structure === "merged"}
              onSelect={() => set("structure", "merged")}
              title={t.expMerged}
              hint={t.expMergedHint}
            />
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-t14">
            <input
              type="checkbox"
              checked={opts.add_total}
              onChange={(e) => set("add_total", e.target.checked)}
              className="size-4 flex-none accent-[var(--accent)]"
            />
            {t.expAddTotal}
          </label>
        </FormRow>

        <FormRow label={t.expFileName} htmlFor="exp-name">
          <div className="flex items-center gap-2">
            <input
              id="exp-name"
              value={opts.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t.bookNamePlaceholder}
              className="field min-w-0 flex-1"
            />
            <span className="num flex-none text-t13 text-ink2">.{opts.format}</span>
          </div>
        </FormRow>
      </div>

      <div className="dlg-foot">
        <button type="button" onClick={onCancel} className="btn btn-quiet btn-lg">
          {t.cancel}
        </button>
        <button type="button" onClick={() => onExport(opts)} disabled={busy} className="btn btn-primary btn-lg">
          {busy ? (
            <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : (
            <DownloadSimple size={18} aria-hidden />
          )}
          {busy ? t.expWorking : issues ? t.expAnyway : t.expDownload}
        </button>
      </div>
    </DialogFrame>
  );
}
