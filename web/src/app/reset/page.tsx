"use client";

/** Đặt lại mật khẩu từ liên kết trong thư (`/reset/#token=…`). Thành công là đã đăng nhập. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell from "@/components/ui/AuthShell";
import { CheckCircle, CircleNotch, Eye, EyeSlash, WarningCircle } from "@/components/ui/icons";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { checkPasswordRules, takeTokenFromUrl } from "@/lib/authnext";
import { useT } from "@/lib/i18n";

export default function ResetPage() {
  const { t } = useT();
  const { reset } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null); // null = chưa đọc xong URL

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [hien, setHien] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    setToken(takeTokenFromUrl());
  }, []);

  const rules = checkPasswordRules(pw);

  function errText(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.code === "weak_password") return t.authWeakPassword(Number(e.info?.min ?? 8));
      if (e.code === "password_policy") return t.authPasswordPolicy;
      if (e.code === "password_common") return t.authPasswordCommon;
      if (e.code === "password_too_long") return t.authPasswordTooLong(Number(e.info?.max ?? 128));
      if (e.code === "bad_token") return t.verifyInvalid;
      if (e.code === "too_large") return t.authTooLarge;
    }
    return e instanceof Error ? e.message : String(e);
  }

  async function gui() {
    setErr(null);
    if (pw.length < 8) {
      setErr(new ApiError("weak_password", 400, "weak_password", { min: 8 }));
      return;
    }
    if (pw.length > 128) {
      setErr(new ApiError("password_too_long", 400, "password_too_long", { max: 128 }));
      return;
    }
    if (!rules.ok) {
      setErr(new ApiError("password_policy", 400, "password_policy"));
      return;
    }
    if (pw !== pw2) {
      setErr(new Error(t.authPwMismatch));
      return;
    }
    setBusy(true);
    try {
      await reset(token ?? "", pw);
      router.replace("/");
    } catch (loi) {
      setErr(loi);
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-t22 font-bold">{t.resetHead}</h1>
      {token === null ? null : !token ? (
        <p role="alert" className="mt-3 text-t14 leading-[1.7] text-ink2">
          {t.resetNoToken}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void gui();
          }}
        >
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="block text-t13 font-bold text-ink2" htmlFor="pw">
              {t.authPwNew}
            </label>
            <button type="button" onClick={() => setHien((v) => !v)} className="btn btn-ghost btn-sm -mr-2 font-normal text-ink2 max-sm:min-h-10">
              {hien ? <EyeSlash size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              {hien ? t.authHidePw : t.authShowPw}
            </button>
          </div>
          <input
            id="pw"
            type={hien ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="field mt-1 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
          />
          <ul aria-live="polite" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-t12">
            {(
              [
                [rules.len, t.pwRuleLen],
                [rules.upper, t.pwRuleUpper],
                [rules.lower, t.pwRuleLower],
                [rules.digit, t.pwRuleDigit],
              ] as const
            ).map(([ok, label]) => (
              <li key={label} className={`flex items-center gap-1.5 ${ok ? "font-bold text-okink" : "text-ink3"}`}>
                <CheckCircle size={13} aria-hidden className="flex-none" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <label className="mt-3.5 block text-t13 font-bold text-ink2" htmlFor="pw2">
            {t.authPwAgain}
          </label>
          <input
            id="pw2"
            type={hien ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="field mt-1.5 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
          />
          {err !== null && (
            <p role="alert" aria-live="assertive" className="mt-4 flex items-start gap-2 rounded-[3px] bg-warnbg px-3 py-2 text-t13 leading-[1.6] text-warnink">
              <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
              <span className="min-w-0">{errText(err)}</span>
            </p>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-5 w-full">
            {busy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
            {busy ? t.authWorking : t.resetGo}
          </button>
        </form>
      )}
      <a href="/forgot/" className="mr-4 mt-4 inline-block text-t13 text-accent underline hover:text-accenthover">
        {t.forgotHead}
      </a>
      <a href="/login/" className="mt-4 inline-block text-t13 text-accent underline hover:text-accenthover">
        {t.backToLogin}
      </a>
    </AuthShell>
  );
}

