"use client";

/**
 * Ai đang đăng nhập — WEB_PLAN §3, §9.1.
 *
 * Phiên nằm trong cookie `HttpOnly` do FastAPI đặt, nên JS KHÔNG đọc được token
 * (đúng ý đồ: mã độc chèn vào trang cũng không lấy được). Cách duy nhất biết
 * mình là ai là hỏi backend `GET /api/auth/me` một lần lúc mở trang.
 *
 * `ready` phân biệt "chưa hỏi xong" với "chưa đăng nhập" — thiếu nó thì trang
 * chớp sang màn đăng nhập một nhịp rồi mới quay lại, rất khó chịu.
 */

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as api from "@/lib/api";
import type { Me } from "@/lib/api";
import { TRIAL_KEY } from "@/lib/authnext";
import { disableGisAutoSelect, resetGisInit } from "@/lib/gis";

type Ctx = {
  user: Me | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Không đăng nhập: máy chủ gửi thư xác minh. */
  register: (email: string, lang: string, captcha?: string) => Promise<void>;
  trial: (id: string, password: string) => Promise<void>;
  /** Tạo tài khoản thử mới, trả ID + mật khẩu để cất vào trình duyệt. */
  trialNew: (captcha?: string) => Promise<{ id: string; password: string }>;
  /** Dùng cho /verify và /reset: thành công là đã đăng nhập. */
  verify: (token: string, password: string) => Promise<void>;
  reset: (token: string, password: string) => Promise<void>;
  /** Nút Google (GIS): gửi ID token, thành công là đã đăng nhập. */
  google: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  ready: false,
  login: async () => {},
  register: async () => {},
  trial: async () => {},
  trialNew: async () => ({ id: "", password: "" }),
  verify: async () => {},
  reset: async () => {},
  google: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        setUser(await api.fetchMe());
      } catch {
        setUser(null);       // chưa đăng nhập, hoặc backend chưa chạy
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api.login(email, password));
  }, []);

  const register = useCallback(async (email: string, lang: string, captcha?: string) => {
    await api.registerEmail(email, lang, captcha);
  }, []);

  const trial = useCallback(async (id: string, password: string) => {
    setUser(await api.trialLogin(id, password));
  }, []);

  const trialNew = useCallback(async (captcha?: string) => {
    const { trial_id, trial_password, ...me } = await api.trialNew(captcha);
    setUser(me);
    return { id: trial_id, password: trial_password };
  }, []);

  const verify = useCallback(async (token: string, password: string) => {
    setUser(await api.verifyEmail(token, password));
  }, []);

  const reset = useCallback(async (token: string, password: string) => {
    setUser(await api.resetPassword(token, password));
  }, []);

  const google = useCallback(async (credential: string) => {
    setUser(await api.googleCredential(credential));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // (Audit 3) Xoá mật khẩu trial lưu cục bộ khi chủ động đăng xuất (tránh lộ trên máy dùng chung)
      try {
        localStorage.removeItem(TRIAL_KEY);
      } catch {
        /* trình duyệt chặn localStorage */
      }
      resetGisInit();
      disableGisAutoSelect();
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, trial, trialNew, verify, reset, google, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
