"use client";

/**
 * Cài đặt theo tài khoản (task 3.1) — nền cho mọi tính năng `Tuỳ chọn`: tắt sẵn, người dùng tự bật trong ⚙.
 *
 * Lưu ở máy chủ (cột `users.prefs`) để đổi máy vẫn giữ. Ngôn ngữ và chủ đề đồng bộ THÊM vào đây nhưng
 * localStorage vẫn là nơi đọc đầu tiên (xem `i18n.tsx`, `theme.tsx`, script chống nháy ở `layout.tsx`): khung
 * hình đầu phải vẽ đúng ngôn ngữ/chủ đề mà không chờ mạng. Sau khi đăng nhập, bản ở máy chủ thắng MỘT lần.
 *
 * Đổi cài đặt là «lạc quan»: giao diện đổi ngay, rồi mới gửi lên máy chủ. Máy chủ trả bản đầy đủ nên chỉ
 * cần nhận câu trả lời của lần gửi MỚI NHẤT (câu trả lời đến muộn của lần trước không được ghi đè).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getPrefs, putPrefs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type Lang } from "@/lib/i18n";
import { DEFAULT_PREFS, FONT_SCALE_KEY, mergePrefs, type Prefs } from "@/lib/prefs-defaults";
import { useTheme, type ThemeMode } from "@/lib/theme";

export type { Prefs };
export { DEFAULT_PREFS };

type Ctx = {
  prefs: Prefs;
  /** Đã nạp xong cài đặt của người đang đăng nhập chưa. */
  loaded: boolean;
  /** Lần lưu gần nhất lên máy chủ có lỗi không (bản trên máy này vẫn đã đổi). */
  saveFailed: boolean;
  update: (patch: Partial<Prefs>) => void;
  /** Người dùng bấm chọn ngôn ngữ / chủ đề: đổi ngay trên máy này VÀ ghi vào tài khoản. */
  chooseLang: (l: Lang) => void;
  chooseTheme: (m: ThemeMode) => void;
};

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  loaded: false,
  saveFailed: false,
  update: () => {},
  chooseLang: () => {},
  chooseTheme: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { lang, setLang } = useT();
  const { mode, setMode } = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Giá trị hiện tại cho effect nạp (chạy theo người dùng, không chạy lại mỗi lần đổi ngôn ngữ)
  const cur = useRef({ lang, mode, setLang, setMode });
  cur.current = { lang, mode, setLang, setMode };
  const seq = useRef(0);

  const userId = user?.id ?? null;
  useEffect(() => {
    seq.current += 1;
    if (!userId) {
      setPrefs(DEFAULT_PREFS);
      setLoaded(false);
      setSaveFailed(false);
      return;
    }
    let live = true;
    getPrefs()
      .then((p) => {
        if (!live) return;
        setPrefs(p);
        // Bản ở máy chủ thắng MỘT lần lúc đăng nhập: đổi máy vẫn giữ lựa chọn cũ
        if (p.lang && p.lang !== cur.current.lang) cur.current.setLang(p.lang);
        if (p.theme && p.theme !== cur.current.mode) cur.current.setMode(p.theme);
      })
      .catch(() => {
        /* máy chủ chưa có route này (bản cũ) hoặc mất mạng: dùng mặc định, vẫn làm việc được */
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [userId]);

  // Cỡ chữ lớn (3.4): chỉ áp khi ĐÃ nạp cài đặt thật — nạp chưa xong mà áp mặc định 1 thì chữ nhảy về cỡ chuẩn một nhịp.
  // Nhớ ở localStorage để lần mở sau script ở layout.tsx đặt đúng ngay từ khung hình đầu.
  const fontScale = prefs.fontScale;
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.style.setProperty("--fs", String(fontScale));
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } catch {
      /* trình duyệt chặn localStorage: chỉ mất việc nhớ cho lần mở sau */
    }
  }, [loaded, fontScale]);

  const update = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((p) => mergePrefs(p, patch));
      if (!userId) return;
      const mine = ++seq.current;
      putPrefs(patch)
        .then((full) => {
          if (mine !== seq.current) return;          // đã có lần gửi mới hơn: câu trả lời này cũ rồi
          setPrefs(full);
          setSaveFailed(false);
        })
        .catch(() => setSaveFailed(true));
    },
    [userId],
  );

  const chooseLang = useCallback(
    (l: Lang) => {
      setLang(l);
      update({ lang: l });
    },
    [setLang, update],
  );
  const chooseTheme = useCallback(
    (m: ThemeMode) => {
      setMode(m);
      update({ theme: m });
    },
    [setMode, update],
  );

  const value = useMemo<Ctx>(
    () => ({ prefs, loaded, saveFailed, update, chooseLang, chooseTheme }),
    [prefs, loaded, saveFailed, update, chooseLang, chooseTheme],
  );
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePrefs() {
  return useContext(PrefsCtx);
}
