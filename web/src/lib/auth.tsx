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

type Ctx = {
  user: Me | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<number>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  ready: false,
  login: async () => {},
  register: async () => 0,
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

  const register = useCallback(async (email: string, password: string) => {
    const me = await api.register(email, password);
    setUser(me);
    return me.claimed_workspaces;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
