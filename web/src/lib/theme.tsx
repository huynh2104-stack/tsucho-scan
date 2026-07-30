"use client";

/**
 * Chủ đề Sáng / Tối / Theo hệ thống — WEB_PLAN §7.5-5.
 *
 * "Theo hệ thống" được quy đổi thành light|dark cụ thể rồi mới ghi lên
 * <html data-theme>, nên CSS chỉ cần biết hai giá trị — một nguồn sự thật.
 * Script chống nháy nằm ở layout.tsx (chạy trước khi trình duyệt vẽ).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "tsucho.theme";

const ThemeCtx = createContext<{
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
}>({ mode: "system", resolved: "light", setMode: () => {} });

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(mode: ThemeMode): "light" | "dark" {
  const resolved = mode === "system" ? (systemDark() ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    const start: ThemeMode =
      saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setModeState(start);
    setResolved(apply(start));

    // Người dùng đổi chủ đề của hệ điều hành trong lúc đang mở trang
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? "system";
      if (cur === "system") setResolved(apply("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(THEME_KEY, m);
    setResolved(apply(m));
  }, []);

  return (
    <ThemeCtx.Provider value={{ mode, resolved, setMode }}>{children}</ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
