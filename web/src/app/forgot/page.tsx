"use client";

/** Quên mật khẩu: một ô email. Luôn hiện cùng một câu — không lộ email nào có tài khoản. */

import { useEffect, useState } from "react";

import AuthShell from "@/components/ui/AuthShell";
import { CheckCircle, CircleNotch, WarningCircle } from "@/components/ui/icons";
import Turnstile from "@/components/ui/Turnstile";
import { ApiError, fetchAuthMethods, forgotPassword } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function ForgotPage() {
  const { t, lang } = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);

  useEffect(() => {
    let con = true;
    fetchAuthMethods()
      .then((m) => con && setSiteKey(m.turnstile_site_key ?? null))
      .catch(() => {});
    return () => {
      con = false;
    };
  }, []);

  async function gui() {
    if (siteKey && !cap) return;
    setErr(null);
    setBusy(true);
    try {
      await forgotPassword(email.trim(), lang, cap ?? undefined);
      setDone(true);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
      setCapKey((k) => k + 1);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-t22 font-bold">{t.forgotHead}</h1>
      {done ? (
        <p role="status" data-testid="forgot-done" className="mt-3 flex items-start gap-2 text-t14 leading-[1.7] text-ink2">
          <CheckCircle size={18} aria-hidden className="mt-[calc(3px*var(--fs))] flex-none text-accent" />
          <span>{t.forgotDone}</span>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void gui();
          }}
        >
          <p className="mt-2 text-t14 leading-[1.7] text-ink2">{t.forgotBody}</p>
          <label className="mt-4 block text-t13 font-bold text-ink2" htmlFor="email">
            {t.authEmail}
          </label>
          <input
            id="email"
            type="email"
            required
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
          />
          {siteKey && <Turnstile siteKey={siteKey} onToken={setCap} resetKey={capKey} />}
          {err !== null && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-[3px] bg-warnbg px-3 py-2 text-t13 leading-[1.6] text-warnink">
              <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
              <span>{err instanceof ApiError && err.code === "captcha" ? t.authCaptchaFail : t.authBadEmail}</span>
            </p>
          )}
          <button type="submit" disabled={busy || (!!siteKey && !cap)} className="btn btn-primary btn-lg mt-5 w-full">
            {busy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
            {busy ? t.authWorking : t.forgotSend}
          </button>
        </form>
      )}
      <a href="/login/" className="mt-4 inline-block text-t13 text-accent underline hover:text-accenthover">
        {t.backToLogin}
      </a>
    </AuthShell>
  );
}
