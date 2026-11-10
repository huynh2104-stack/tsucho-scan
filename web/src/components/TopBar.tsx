"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import LangMenu from "@/components/LangMenu";
import SettingsDialog from "@/components/SettingsDialog";
import { BrandMark } from "@/components/ui/Brand";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { CaretDown, CaretRight, Gear, Monitor, Moon, Question, SignOut, Sun, User } from "@/components/ui/icons";
import { useCase } from "@/lib/case";
import { usePrefs } from "@/lib/prefs";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useTour } from "@/lib/tour";

/* 40px trên điện thoại: ngón tay không bấm chính xác như chuột */
const ICON_BTN = "btn btn-ghost btn-icon max-sm:h-10 max-sm:w-10";
/* Menu đang mở thì nút giữ nguyên màu như lúc rê chuột, để biết menu thuộc nút nào */
const MENU_OPEN = "aria-expanded:bg-shell3 aria-expanded:text-shellink";

export default function TopBar() {
  const { t } = useT();
  const { mode } = useTheme();
  const { chooseTheme } = usePrefs();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { start: startTour } = useTour();
  const { current } = useCase();
  const pathname = usePathname() ?? "/";
  const onCases = pathname.startsWith("/cases");

  // Trang đăng nhập có bố cục riêng, đã tự vẽ thương hiệu và nút đổi ngôn ngữ
  if (pathname.startsWith("/login")) return null;

  const accountEntries: MenuEntry[] = user
    ? [
        { kind: "label", key: "who", text: user.email },
        { kind: "sep", key: "s1" },
        { kind: "label", key: "theme", text: t.theme },
        { kind: "item", key: "light", text: t.themeLight, icon: <Sun size={16} aria-hidden />, checked: mode === "light", onSelect: () => chooseTheme("light") },
        { kind: "item", key: "dark", text: t.themeDark, icon: <Moon size={16} aria-hidden />, checked: mode === "dark", onSelect: () => chooseTheme("dark") },
        { kind: "item", key: "system", text: t.themeSystem, icon: <Monitor size={16} aria-hidden />, checked: mode === "system", onSelect: () => chooseTheme("system") },
        { kind: "sep", key: "s2" },
        { kind: "item", key: "out", text: t.signOut, icon: <SignOut size={16} aria-hidden />, onSelect: logout },
      ]
    : [];

  return (
    <>
      {/* Luôn một dòng, cao cố định: dòng thứ hai từng làm cả bàn làm việc nhảy xuống giữa lúc bấm */}
      <header className="on-ink sticky top-0 z-30 flex h-12 flex-none items-center gap-3 bg-shell pl-4 pr-2 text-shellink max-sm:gap-2 max-sm:pl-3 max-sm:pr-1">
        <Link href="/" className="flex flex-none items-center gap-2 rounded-[2px] text-shellink no-underline">
          <BrandMark size={24} />
          <span className="text-t15 font-bold max-sm:sr-only">{t.appName}</span>
        </Link>

        {/* Hồ sơ: lối về danh sách + tên hồ sơ đang mở. Chỉ hiện khi đã đăng nhập. */}
        {user && (
          <nav className="flex min-w-0 items-center gap-1.5 text-t14" aria-label={t.casesTitle}>
            <span aria-hidden className="mx-1 h-4 w-px flex-none bg-shellrule max-sm:hidden" />
            {onCases ? (
              <span data-tour="cases" aria-current="page" className="flex-none font-bold text-shellink">
                {t.casesTitle}
              </span>
            ) : (
              <Link
                href="/cases/"
                data-tour="cases"
                title={t.casesLinkTitle}
                className="flex-none rounded-[2px] text-shellink2 no-underline transition-colors duration-100 hover:text-shellink hover:underline"
              >
                {t.casesLink}
              </Link>
            )}
            {!onCases && current && (
              <>
                <CaretRight size={12} aria-hidden className="flex-none text-shellink2" />
                <span className="flex min-w-0 items-center gap-2" data-testid="current-case">
                  <span className="min-w-0 max-w-[340px] truncate font-bold" title={current.name || t.casesUntitled}>
                    {current.name || <span className="font-normal text-shellink2">{t.casesUntitled}</span>}
                  </span>
                  {current.archived && <span className="tag flex-none bg-shell3 text-shellink2 max-sm:hidden">{t.casesArchivedTag}</span>}
                </span>
              </>
            )}
          </nav>
        )}

        <div className="ml-auto flex flex-none items-center gap-0.5">
          <LangMenu className={`${MENU_OPEN} max-sm:h-10 max-sm:w-10 max-sm:px-0`} />
          {user && (
            <>
              {/* Xem lại hướng dẫn. Bước cuối của hướng dẫn chỉ thẳng vào nút này. */}
              <button type="button" data-tour="help" onClick={startTour} title={t.helpBtn} aria-label={t.helpBtn} className={ICON_BTN}>
                <Question size={18} aria-hidden />
              </button>
              <button
                type="button"
                data-testid="settings-btn"
                onClick={() => setSettingsOpen(true)}
                title={t.settingsBtn}
                aria-label={t.settingsBtn}
                className={ICON_BTN}
              >
                <Gear size={18} aria-hidden />
              </button>
              <Menu
                label={t.accountMenu}
                title={user.email}
                entries={accountEntries}
                minWidth={220}
                className={`btn btn-ghost ${MENU_OPEN} max-sm:h-10 max-sm:w-10 max-sm:px-0`}
              >
                <User size={18} aria-hidden className="flex-none sm:hidden" />
                <span className="max-w-[160px] truncate max-sm:hidden">{user.email}</span>
                <CaretDown size={12} aria-hidden className="flex-none max-sm:hidden" />
              </Menu>
            </>
          )}
        </div>
      </header>

      {/* Nằm ngoài <header>: trong đó sẽ ăn theo màu của .on-ink và bị nhốt trong stacking context của thanh trên */}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
