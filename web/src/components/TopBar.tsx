"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { LANGS, LANG_LABEL, useT, type Lang } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useTour } from "@/lib/tour";

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function AutoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 20.5h8" />
    </svg>
  );
}

export default function TopBar() {
  const { lang, t, setLang } = useT();
  const { mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const { start: startTour } = useTour();

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: t.themeLight, icon: <SunIcon /> },
    { id: "dark", label: t.themeDark, icon: <MoonIcon /> },
    { id: "system", label: t.themeSystem, icon: <AutoIcon /> },
  ];

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-rule bg-card px-5 py-3">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent text-accentink">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 3.5h9l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 20.5v-15A1.5 1.5 0 0 1 5.5 3.5Z" />
            <path d="M13.5 3.5V9h5M8 13h8M8 17h5" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-tight">{t.appName}</span>
            <span className="rounded bg-accentpale px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-accent">
              JP 通帳
            </span>
          </span>
          <span className="text-[10.5px] text-ink3">{t.tagline}</span>
        </span>
      </Link>

      <div className="flex-1" />

      {/* Chủ đề: 3 trạng thái, biểu tượng + nhãn đọc được cho trình đọc màn hình */}
      <div
        className="flex overflow-hidden rounded-lg border border-rule"
        role="group"
        aria-label={t.theme}
      >
        {themes.map((th) => (
          <button
            key={th.id}
            onClick={() => setMode(th.id)}
            aria-pressed={mode === th.id}
            title={th.label}
            className={`flex items-center gap-1.5 border-r border-rule px-2.5 py-1.5 text-[13px] last:border-r-0 ${
              mode === th.id
                ? "bg-accent font-semibold text-white"
                : "bg-card text-ink2 hover:bg-accentpale hover:text-ink"
            }`}
          >
            {th.icon}
            <span className="sr-only">{th.label}</span>
          </button>
        ))}
      </div>

      {/* Ngôn ngữ */}
      <div
        className="flex overflow-hidden rounded-lg border border-rule"
        role="group"
        aria-label="Ngôn ngữ / Language / 言語"
      >
        {LANGS.map((l: Lang) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`border-r border-rule px-3 py-1.5 text-[13px] last:border-r-0 ${
              lang === l
                ? "bg-accent font-semibold text-white"
                : "bg-card text-ink2 hover:bg-accentpale hover:text-ink"
            }`}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      {/* Tài khoản — chỉ hiện khi đã đăng nhập, để trang /login không bị rối */}
      {user && (
        <div className="flex items-center gap-2.5">
          {/* Xem lại hướng dẫn. Để cạnh tên tài khoản vì đây là chỗ mắt tìm
              đến khi bí, và bước cuối của hướng dẫn chỉ thẳng vào nút này. */}
          <button
            data-tour="help"
            onClick={startTour}
            title={t.helpBtn}
            aria-label={t.helpBtn}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-rule text-[13px] font-bold text-ink2 hover:border-accent hover:bg-accentpale hover:text-accent"
          >
            ?
          </button>
          <span className="max-w-[190px] truncate text-[13px] text-ink2" title={user.email}>
            {user.email}
          </span>
          <button
            onClick={logout}
            className="rounded-lg border border-rule px-3 py-1.5 text-[13px] text-ink2 hover:bg-accentpale hover:text-ink"
          >
            {t.signOut}
          </button>
        </div>
      )}
    </header>
  );
}
