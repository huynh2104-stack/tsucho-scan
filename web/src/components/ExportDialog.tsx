"use client";

/**
 * Hộp thoại xuất file — thay cho hai nút Excel/CSV bấm là tải ngay.
 *
 * Lý do có hộp thoại: bốn quyết định độc lập (định dạng, phạm vi, cấu trúc,
 * dòng 合計) mà mỗi lần xuất người dùng chọn khác nhau. Nhồi hết thành nút thì
 * thành 8 nút; hỏi một lần thì rõ ràng hơn.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export type ExportOpts = {
  format: "xlsx" | "csv";
  scope: "current" | "ticked" | "all";
  structure: "per_sheet" | "merged";
  add_total: boolean;
  name: string;
};

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
      className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
        checked
          ? "border-accent bg-accentpale"
          : "border-rule bg-card hover:border-accentmid"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
        <span
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
            checked ? "border-accent bg-accent" : "border-rule"
          }`}
        >
          {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        {title}
      </span>
      {hint && <span className="pl-5 text-[11.5px] text-ink3">{hint}</span>}
    </button>
  );
}

export default function ExportDialog({
  open,
  bookName,
  tickedCount,
  totalCount,
  hasCurrent,
  busy,
  onCancel,
  onExport,
}: {
  open: boolean;
  bookName: string;
  tickedCount: number;
  totalCount: number;
  hasCurrent: boolean;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exp-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-lg overflow-auto rounded-xl border border-rule bg-card shadow-2xl"
      >
        <header className="border-b border-rule px-5 py-3">
          <h2 id="exp-title" className="text-[16px] font-bold">
            {t.exportTitle}
          </h2>
          <p className="text-[12.5px] text-ink3">{t.exportSubtitle}</p>
        </header>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* 1. Định dạng */}
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
              1. {t.expFormat}
            </h3>
            <div className="flex gap-2">
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
          </section>

          {/* 2. Phạm vi */}
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
              2. {t.expScope}
            </h3>
            <div className="flex flex-col gap-1.5">
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
          </section>

          {/* 3. Cấu trúc — CSV chỉ có một bảng nên khoá lại */}
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
              3. {t.expStructure}
            </h3>
            <div className="flex gap-2">
              <Choice
                checked={opts.structure === "per_sheet"}
                onSelect={() => set("structure", "per_sheet")}
                title={t.expPerSheet}
                hint={opts.format === "csv" ? t.expPerSheetCsv : t.expPerSheetHint}
              />
              <Choice
                checked={opts.structure === "merged"}
                onSelect={() => set("structure", "merged")}
                title={t.expMerged}
                hint={t.expMergedHint}
              />
            </div>

            <label className="mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-ink2">
              <input
                type="checkbox"
                checked={opts.add_total}
                onChange={(e) => set("add_total", e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {t.expAddTotal}
            </label>
          </section>

          {/* Tên file */}
          <section className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
              {t.expFileName}
            </label>
            <div className="flex items-center gap-2">
              <input
                value={opts.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t.bookNamePlaceholder}
                className="flex-1 rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[14px]"
              />
              <span className="text-[13px] text-ink3">.{opts.format}</span>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-rule px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-rule px-4 py-2 text-[14px] text-ink2 hover:border-accentmid hover:text-ink"
          >
            {t.cancel}
          </button>
          <button
            onClick={() => onExport(opts)}
            disabled={busy}
            className="rounded-lg border border-accent bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:brightness-110 disabled:opacity-45"
          >
            {busy ? t.expWorking : t.expDownload}
          </button>
        </footer>
      </div>
    </div>
  );
}
