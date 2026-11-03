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

import { DICT, LANGS, LANG_LABEL, type Dict, type Lang } from "./dict";

// Giữ nguyên đường import cũ (`@/lib/i18n`) cho các component đang dùng.
export { LANGS, LANG_LABEL };
export type { Dict, Lang };

/** Ngôn ngữ khi người dùng CHƯA từng chọn: tiếng Nhật, bất kể trình duyệt — người dùng thật là người Nhật,
 *  và trang dựng sẵn (static export) cũng vẽ bằng ngôn ngữ này nên khung hình đầu không nháy tiếng khác. */
export const DEFAULT_LANG: Lang = "ja";

const LangCtx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: DEFAULT_LANG,
  // `Dict` là kiểu literal của bản tiếng Việt nên ép thẳng bản tiếng Nhật sang đó phải qua `unknown`
  t: DICT[DEFAULT_LANG] as unknown as Dict,
  setLang: () => {},
});

const KEY = "tsucho.lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  // Đọc lựa chọn cũ sau khi hydrate — không đọc lúc render đầu để server và
  // client cho ra cùng một HTML. Chưa từng chọn thì tiếng Nhật (DEFAULT_LANG).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* trình duyệt chặn localStorage: coi như chưa có lựa chọn */
    }
    const chosen: Lang =
      saved && (LANGS as readonly string[]).includes(saved) ? (saved as Lang) : DEFAULT_LANG;
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
