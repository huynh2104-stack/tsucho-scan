"use client";

/**
 * Đa ngôn ngữ VI / EN / JA — WEB_PLAN §8.
 *
 * LUẬT QUAN TRỌNG: tên cột sổ (摘要, 差引残高, お預り金額...) KHÔNG dịch.
 * Người dùng đang đối chiếu với ảnh in chữ 摘要 — dịch thành "Nội dung" là bắt
 * họ tra ngược. Chỉ dịch chữ của giao diện; tên cột giữ tiếng Nhật và thêm chú
 * thích nhỏ bên dưới (xem `colGloss`).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { DICT, LANGS, LANG_LABEL, detectLang, type Dict, type Lang } from "./dict";

// Giữ nguyên đường import cũ (`@/lib/i18n`) cho các component đang dùng.
export { LANGS, LANG_LABEL };
export type { Dict, Lang };

const LangCtx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: "vi",
  t: DICT.vi,
  setLang: () => {},
});

const KEY = "tsucho.lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");

  // Đọc lựa chọn cũ sau khi hydrate — không đọc lúc render đầu để server và
  // client cho ra cùng một HTML. Chưa từng chọn thì theo ngôn ngữ của trình duyệt
  // (người Nhật mở lần đầu phải thấy tiếng Nhật, không phải tiếng Việt).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* trình duyệt chặn localStorage: coi như chưa có lựa chọn */
    }
    const chosen: Lang =
      saved && (LANGS as readonly string[]).includes(saved)
        ? (saved as Lang)
        : detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
    setLangState(chosen);
    // LUÔN đặt lang của <html> lúc nạp, không chỉ khi bấm đổi: trình duyệt chọn phông Hán theo
    // `lang` (Android dễ hiện nét chữ Trung Quốc nếu vẫn là lang="vi" khi đang xem tiếng Nhật).
    document.documentElement.lang = chosen;
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l;
  }, []);

  return (
    <LangCtx.Provider value={{ lang, t: DICT[lang] as Dict, setLang }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useT() {
  return useContext(LangCtx);
}
