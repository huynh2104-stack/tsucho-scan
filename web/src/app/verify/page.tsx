"use client";

/** Hoàn tất đăng ký (`/verify/#token=…`): người dùng tự đặt mật khẩu rồi mới được đăng nhập.
 *  KHÔNG tự gọi API lúc mở trang (trình quét link trong hộp thư sẽ "dùng" mất token). */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell from "@/components/ui/AuthShell";
import { CheckCircle, CircleNotch, Eye, EyeSlash, WarningCircle } from "@/components/ui/icons";
import Turnstile from "@/components/ui/Turnstile";
import { ApiError, fetchAuthMethods, resendVerify } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { checkPasswordRules, takeTokenFromUrl } from "@/lib/authnext";
import { useT } from "@/lib/i18n";

const ERR_BOX = "mt-4 flex items-start gap-2 rounded-[3px] bg-warnbg px-3 py-2 text-t13 leading-[1.6] text-warnink";
const INPUT = "field mt-1.5 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16";

export default function VerifyPage() {
  const { t, lang } = useT();
  const { verify } = useAuth();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null); // null = chưa đọc xong URL
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [hien, setHien] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [bad, setBad] = useState(false);

  const [email, setEmail] = useState("");
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [methodsDone, setMethodsDone] = useState(false);
  const [cap, setCap] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [resendErr, setResendErr] = useState<unknown>(null);

  useEffect(() => {
    setToken(takeTokenFromUrl());
    fetchAuthMethods()
      .then((m) => setSiteKey(m.turnstile_site_key ?? null))
      .catch(() => {})
      .finally(() => setMethodsDone(true));
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const rules = checkPasswordRules(pw);

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
      await verify(token ?? "", pw);
      router.replace("/");
    } catch (e) {
      if (e instanceof ApiError && e.code === "bad_token") setBad(true);
      else setErr(e);
      setBusy(false);
    }
  }

  async function guiLai() {
    if (!methodsDone || (siteKey && !cap)) return;
    setResendErr(null);
    setWait(60);
    setResent(true);
    try {
      await resendVerify(email.trim(), lang, cap ?? undefined);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "captcha" || e.code === "mail_off")) {
        setWait(0);
        setResent(false);
        setResendErr(e);
      }
    } finally {
      setCapKey((k) => k + 1);
    }
  }

  function errText(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.code === "weak_password") return t.authWeakPassword(Number(e.info?.min ?? 8));
      if (e.code === "password_policy") return t.authPasswordPolicy;
      if (e.code === "password_common") return t.authPasswordCommon;
      if (e.code === "password_too_long") return t.authPasswordTooLong(Number(e.info?.max ?? 128));
      if (e.code === "too_large") return t.authTooLarge;
    }
    return e instanceof Error ? e.message : String(e);
  }

  if (token === null) {
    return (
      <AuthShell>
        <p role="status" className="flex items-center gap-2 text-t16 font-bold">
          <CircleNotch size={20} aria-hidden className="animate-spin motion-reduce:animate-none" />
          {t.verifyWorking}
        </p>
      </AuthShell>
    );
  }

  if (!token || bad) {
    return (
      <AuthShell>
        <p role="alert" className="flex items-start gap-2 text-t15 leading-[1.7]">
          <WarningCircle size={20} aria-hidden className="mt-[calc(3px*var(--fs))] flex-none text-warnink" />
          <span>{token ? t.verifyInvalid : t.verifyNoToken}</span>
        </p>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (wait <= 0) void guiLai();
          }}
        >
          <label className="block text-t13 font-bold text-ink2" htmlFor="email">
            {t.verifyAskEmail}
          </label>
          <input
            id="email"
            type="email"
            required
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
          {siteKey && <Turnstile siteKey={siteKey} onToken={setCap} resetKey={capKey} />}
          {resendErr !== null && (
            <p role="alert" className={ERR_BOX}>
              <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
              <span className="min-w-0">
                {resendErr instanceof ApiError && resendErr.code === "mail_off" ? t.authMailOff : t.authCaptchaFail}
              </span>
            </p>
          )}
          <button type="submit" disabled={wait > 0 || !methodsDone || (!!siteKey && !cap)} className="btn btn-primary btn-lg mt-4 w-full">
            {wait > 0 ? t.authResendWait(wait) : t.authResend}
          </button>
          {resent && wait > 0 && (
            <p role="status" className="mt-2 text-t13 text-okink">
              {t.authResent}
            </p>
          )}
        </form>
        <a href="/login/" className="mt-4 inline-block text-t13 text-accent underline hover:text-accenthover">
          {t.backToLogin}
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-t22 font-bold">{t.verifyHead}</h1>
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
          className={INPUT}
        />
        {err !== null && (
          <p role="alert" aria-live="assertive" className={ERR_BOX}>
            <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
            <span className="min-w-0">{errText(err)}</span>
          </p>
        )}
        <button type="submit" data-testid="verify-submit" disabled={busy} className="btn btn-primary btn-lg mt-5 w-full">
          {busy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {busy ? t.authWorking : t.verifyGo}
        </button>
      </form>
    </AuthShell>
  );
}
