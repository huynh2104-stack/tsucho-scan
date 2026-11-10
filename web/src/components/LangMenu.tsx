"use client";

/** Nút đổi ngôn ngữ: dùng chung cho thanh trên và trang đăng nhập (trang đó không có thanh trên). */

import Menu from "@/components/ui/Menu";
import { Translate } from "@/components/ui/icons";
import { LANGS, LANG_LABEL, useT } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";

export default function LangMenu({ className = "" }: { className?: string }) {
  const { lang } = useT();
  const { chooseLang } = usePrefs();

  return (
    <Menu
      // Ghi cả ba thứ tiếng: người đang kẹt ở tiếng lạ vẫn đọc ra được đây là nút đổi ngôn ngữ
      label="Ngôn ngữ / Language / 言語"
      title="Ngôn ngữ / Language / 言語"
      minWidth={148}
      className={`btn btn-ghost ${className}`}
      entries={LANGS.map((l) => ({
        kind: "item",
        key: l,
        text: LANG_LABEL[l],
        checked: lang === l,
        onSelect: () => chooseLang(l),
      }))}
    >
      <Translate size={18} aria-hidden className="flex-none" />
      <span className="max-sm:sr-only">{LANG_LABEL[lang]}</span>
    </Menu>
  );
}
