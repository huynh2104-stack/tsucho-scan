"use client";

/**
 * Hộp «Cài đặt» (task 3.1): chỗ bật/tắt các tính năng `Tuỳ chọn`, lưu THEO TÀI KHOẢN.
 *
 * Quy tắc của dự án (docs/KE_HOACH_NANG_CAP_WEB.md mục 2): thứ làm đổi giao diện hay hành vi của người bật nó
 * thì TẮT SẴN và nằm ở đây; mỗi dòng có một câu nói ai nên bật. Mỗi task thêm tuỳ chọn của mình vào đây —
 * hộp chỉ liệt kê những gì ĐÃ chạy được, không có công tắc nào đứng không.
 */

import { useEffect, useState, type ReactNode } from "react";

import DialogFrame from "@/components/ui/DialogFrame";
import Segmented from "@/components/ui/Segmented";
import { X } from "@/components/ui/icons";
import { useCorrections } from "@/lib/corrections-provider";
import { LANGS, LANG_LABEL, useT, type Lang } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useTheme, type ThemeMode } from "@/lib/theme";

/** Một dòng cài đặt: nhãn bên trái, điều khiển bên phải; màn hẹp thì xếp chồng. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[calc(104px*var(--fs))_minmax(0,1fr)]">
      <span className="text-t13 text-ink2">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** «Từ điển sửa lỗi» (task 3.3): chọn cách dùng + xem / xoá những gì đã học. */
function DictionarySection() {
  const { t } = useT();
  const { prefs, update } = usePrefs();
  const { entries, loaded, remove, clear } = useCorrections();
  const [confirmClear, setConfirmClear] = useState(false);
  const [failed, setFailed] = useState(false);

  const modes: { id: "suggest" | "auto" | "off"; label: string; hint: string }[] = [
    { id: "suggest", label: t.dictModeSuggest, hint: t.dictHintSuggest },
    { id: "auto", label: t.dictModeAuto, hint: t.dictHintAuto },
    { id: "off", label: t.dictModeOff, hint: t.dictHintOff },
  ];
  const hint = modes.find((m) => m.id === prefs.dictMode)?.hint ?? "";
  const guard = async (fn: () => Promise<void>) => {
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    }
  };

  return (
    <section data-testid="dict-section" className="flex flex-col gap-3 border-t border-rule2 pt-5">
      <div>
        <h3 className="text-t14 font-bold">{t.dictTitle}</h3>
        <p className="mt-1 text-t13 leading-[1.7] text-ink2">{t.dictIntro}</p>
      </div>
      <SettingRow label={t.dictModeLabel}>
        <Segmented<"suggest" | "auto" | "off">
          value={prefs.dictMode}
          options={modes.map((m) => ({ id: m.id, label: m.label }))}
          onChange={(m) => update({ dictMode: m })}
          layoutId="settings-dict"
          label={t.dictModeLabel}
          className="max-w-full flex-wrap"
        />
      </SettingRow>
      <p data-testid="dict-mode-hint" className="text-t12 leading-[1.7] text-ink3 sm:pl-[calc(104px*var(--fs)+16px)]">
        {hint}
      </p>

      <h4 className="mt-1 flex items-baseline gap-1.5 text-t13 font-bold text-ink2">
        {t.dictListTitle} <span className="num font-normal text-ink3">{entries.length}</span>
      </h4>
      {failed && (
        <p role="alert" className="rounded-[3px] bg-warnbg px-3 py-1.5 text-t12 font-bold text-warnink">
          {t.dictFail}
        </p>
      )}
      {loaded && entries.length === 0 ? (
        <p data-testid="dict-empty" className="text-t13 text-ink3">
          {t.dictEmpty}
        </p>
      ) : (
        <div className="thin-scroll max-h-56 overflow-y-auto border-y border-rule2">
          <table className="w-full border-collapse text-t13">
            <thead className="sticky top-0 bg-band text-left text-t12 text-ink2">
              <tr>
                <th className="px-2 py-1 font-bold">{t.dictColWrong}</th>
                <th className="px-2 py-1 font-bold">{t.dictColRight}</th>
                <th className="px-2 py-1 text-right font-bold">{t.dictColHits}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} data-dict-entry={e.id} className="border-t border-rule2">
                  <td className="max-w-[40%] break-all px-2 py-1">{e.wrong}</td>
                  <td className="break-all px-2 py-1 font-bold">{e.right}</td>
                  <td className="num px-2 py-1 text-right text-ink3">{e.hits}</td>
                  <td className="px-0.5 text-center">
                    <button
                      type="button"
                      data-dict-delete={e.id}
                      onClick={() => void guard(() => remove(e.id))}
                      title={t.dictDelete}
                      aria-label={t.dictDelete}
                      className="btn btn-ghost btn-sm btn-icon hover:text-danger"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length > 0 &&
        (confirmClear ? (
          <div className="flex flex-wrap items-center gap-2 text-t13">
            <span className="text-danger">{t.dictClearConfirm(entries.length)}</span>
            <button
              type="button"
              data-testid="dict-clear-yes"
              onClick={() => void guard(clear).then(() => setConfirmClear(false))}
              className="btn btn-danger-solid btn-sm"
            >
              {t.dictClearYes}
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="btn btn-quiet btn-sm">
              {t.cancel}
            </button>
          </div>
        ) : (
          <button type="button" data-testid="dict-clear" onClick={() => setConfirmClear(true)} className="btn btn-danger btn-sm self-start">
            {t.dictClearAll}
          </button>
        ))}
    </section>
  );
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const { mode } = useTheme();
  const { chooseLang, chooseTheme, saveFailed, prefs, update } = usePrefs();
  const sizes: { id: "1" | "1.15" | "1.3"; label: string }[] = [
    { id: "1", label: t.fontStd },
    { id: "1.15", label: t.fontLarge },
    { id: "1.3", label: t.fontXL },
  ];

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
    <DialogFrame labelledBy="settings-title" onClose={onClose} maxWidth={580} testId="settings-dialog">
      <div className="dlg-head">
        <div className="min-w-0">
          <h2 id="settings-title" className="text-t16 font-bold">
            {t.settingsTitle}
          </h2>
          <p className="mt-0.5 text-t13 font-normal leading-[1.5] text-ink2">{t.settingsNote}</p>
        </div>
      </div>

      <div className="dlg-body flex flex-col gap-5">
        {saveFailed && (
          <p role="alert" data-testid="settings-save-failed" className="rounded-[3px] bg-warnbg px-3 py-2 text-t13 font-bold text-warnink">
            {t.settingsSaveFailed}
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-t14 font-bold">{t.settingsLook}</h3>
          <SettingRow label={t.settingsLang}>
            <Segmented<Lang>
              value={lang}
              options={LANGS.map((l) => ({ id: l, label: LANG_LABEL[l] }))}
              onChange={chooseLang}
              layoutId="settings-lang"
              label={t.settingsLang}
            />
          </SettingRow>
          <SettingRow label={t.theme}>
            <Segmented<ThemeMode>
              value={mode}
              options={themes}
              onChange={chooseTheme}
              layoutId="settings-theme"
              label={t.theme}
              className="max-w-full flex-wrap"
            />
          </SettingRow>
        </section>

        <section data-testid="font-section" className="flex flex-col gap-3 border-t border-rule2 pt-5">
          <h3 className="text-t14 font-bold">{t.fontLabel}</h3>
          <Segmented<"1" | "1.15" | "1.3">
            value={String(prefs.fontScale) as "1" | "1.15" | "1.3"}
            options={sizes}
            onChange={(v) => update({ fontScale: Number(v) as 1 | 1.15 | 1.3 })}
            layoutId="settings-font"
            label={t.fontLabel}
            className="self-start"
          />
          <p className="text-t12 leading-[1.7] text-ink3">{t.fontHint}</p>
        </section>

        <DictionarySection />
      </div>

      <div className="dlg-foot">
        <button type="button" onClick={onClose} className="btn btn-primary">
          {t.settingsClose}
        </button>
      </div>
    </DialogFrame>
  );
}
