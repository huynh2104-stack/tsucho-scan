"use client";

/**
 * Đăng nhập / đăng ký — WEB_PLAN §3.
 *
 * Một trang, hai chế độ. Người dùng cuối là kế toán lớn tuổi người Nhật nên:
 * chữ to, hai ô nhập, một nút, không có bước thừa.
 *
 * Chuyển hướng nằm trong `useEffect` chứ không gọi thẳng lúc render — đổi route
 * trong lúc React đang render là lỗi.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, Unauthorized } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useT();
  const { user, ready, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Giữ NGUYÊN lỗi chứ không giữ câu đã dịch: dịch lúc lưu thì người dùng đổi
  // sang tiếng Nhật vẫn thấy câu tiếng Việt đứng nguyên đó.
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "up") await register(email, password);
      else await login(email, password);
      router.replace("/");
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  }

  /** Server gửi MÃ lỗi vì nó không biết người dùng đang xem tiếng nào; câu chữ
   *  ghép ở đây, ngay lúc VẼ. Lỗi chưa có mã thì hiện nguyên văn. */
  function errText(e: unknown): string {
    if (e instanceof ApiError && e.code === "locked") {
      const giay = Number(e.info?.seconds ?? 0);
      return t.authLocked(Math.max(1, Math.ceil(giay / 60)));
    }
    // Ở TRANG NÀY 401 chỉ có một nghĩa: sai email hoặc sai mật khẩu (server cố
    // ý không nói rõ cái nào, để người ngoài không dò ra email nào có thật).
    if (e instanceof Unauthorized) return t.authBadLogin;
    return e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-[400px] rounded-2xl border border-rule bg-card p-7 shadow-[var(--shadow)]"
      >
        <h1 className="text-[19px] font-bold tracking-tight">
          {mode === "up" ? t.authHeadUp : t.authHeadIn}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink2">{t.authPrivacy}</p>

        <label className="mt-6 block text-[13px] font-semibold text-ink2" htmlFor="email">
          {t.authEmail}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-rule bg-card2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
        />

        <label
          className="mt-4 block text-[13px] font-semibold text-ink2"
          htmlFor="password"
        >
          {t.authPassword}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-rule bg-card2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
        />
        {mode === "up" && (
          <p className="mt-1.5 text-[12px] text-ink3">{t.authPasswordHint}</p>
        )}

        {err !== null && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-warnedge bg-warnbg px-3 py-2 text-[13px] text-warnink"
          >
            {errText(err)}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-[15px] font-semibold text-accentink disabled:opacity-60"
        >
          {busy ? t.authWorking : mode === "up" ? t.signUp : t.signIn}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "up" ? "in" : "up");
            setErr(null);
          }}
          className="mt-4 w-full text-[13px] text-accent underline underline-offset-2"
        >
          {mode === "up" ? t.authToIn : t.authToUp}
        </button>
      </form>
    </div>
  );
}
