"use client";

/**
 * Hộp «Cài đặt» (task 3.1): chỗ bật/tắt các tính năng `Tuỳ chọn`, lưu THEO TÀI KHOẢN.
 *
 * Quy tắc của dự án (docs/KE_HOACH_NANG_CAP_WEB.md mục 2): thứ làm đổi giao diện hay hành vi của người bật nó
 * thì TẮT SẴN và nằm ở đây; mỗi dòng có một câu nói ai nên bật. Mỗi task thêm tuỳ chọn của mình vào đây —
 * hộp chỉ liệt kê những gì ĐÃ chạy được, không có công tắc nào đứng không.
 */

import { useEffect } from "react";

import { LANGS, LANG_LABEL, useT, type Lang } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useTheme, type ThemeMode } from "@/lib/theme";

function Group<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-28 flex-none text-[13px] font-medium text-ink2">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-rule" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onPick(o.id)}
            className={`border-r border-rule px-3 py-1.5 text-[13px] last:border-r-0 ${
              value === o.id
                ? "bg-accent font-semibold text-white"
                : "bg-card text-ink2 hover:bg-accentpale hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const { mode } = useTheme();
  const { chooseLang, chooseTheme, saveFailed } = usePrefs();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const themes: { id: ThemeMode; label: string }[] = [
    { id: "light", label: t.themeLight },
    { id: "dark", label: t.themeDark },
    { id: "system", label: t.themeSystem },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-dialog"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-rule bg-card shadow-2xl"
      >
        <header className="flex-none border-b border-rule px-5 py-3">
          <h2 id="settings-title" className="text-[16px] font-bold">
            {t.settingsTitle}
          </h2>
          <p className="text-[12.5px] text-ink3">{t.settingsNote}</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {saveFailed && (
            <p
              role="alert"
              data-testid="settings-save-failed"
              className="rounded-lg border border-warnedge bg-warnbg px-3 py-2 text-[12.5px] font-medium text-warnink"
            >
              {t.settingsSaveFailed}
            </p>
          )}

          <section className="flex flex-col gap-2.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink3">{t.settingsLook}</h3>
            <Group<Lang>
              label={t.settingsLang}
              value={lang}
              options={LANGS.map((l) => ({ id: l, label: LANG_LABEL[l] }))}
              onPick={chooseLang}
            />
            <Group<ThemeMode> label={t.theme} value={mode} options={themes} onPick={chooseTheme} />
          </section>
        </div>

        <footer className="flex flex-none items-center justify-end border-t border-rule px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-accent bg-accent px-4 py-2 text-[14px] font-semibold text-white hover:brightness-110"
          >
            {t.settingsClose}
          </button>
        </footer>
      </div>
    </div>
  );
}
