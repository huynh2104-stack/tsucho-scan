"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

/** Nạp script Cloudflare đúng MỘT lần, chỉ khi có component cần tới. Quá 15 giây chưa xong (mạng kẹt, trình chặn
 *  quảng cáo nuốt im lặng) thì coi như hỏng để người dùng thấy lý do thay vì nút bấm bị khoá mãi. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const fail = () => {
        loading = null;
        reject(new Error("turnstile"));
      };
      const timer = window.setTimeout(fail, 15000);
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => {
        window.clearTimeout(timer);
        if (window.turnstile) resolve();
        else fail();
      };
      s.onerror = () => {
        window.clearTimeout(timer);
        s.remove();
        fail();
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/**
 * Ô chống bot Cloudflare Turnstile. `onToken(null)` khi token hết hạn / lỗi.
 * Token dùng một lần: đổi `resetKey` (tăng lên) sau mỗi lần gửi để lấy token mới.
 */
export default function Turnstile({
  siteKey,
  onToken,
  resetKey = 0,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const { t, lang } = useT();
  const [broken, setBroken] = useState(false);
  const { resolved } = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let dead = false;
    setBroken(false);
    loadScript()
      .then(() => {
        if (dead || !box.current || !window.turnstile) return;
        idRef.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: lang,
          theme: resolved,
          callback: (tk: string) => cb.current(tk),
          "expired-callback": () => cb.current(null),
          "error-callback": () => {
            cb.current(null);
            if (!dead) setBroken(true);
          },
        });
      })
      .catch(() => {
        cb.current(null);
        if (!dead) setBroken(true);
      });
    return () => {
      dead = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
      cb.current(null);
    };
  }, [siteKey, lang, resolved]);

  useEffect(() => {
    if (resetKey === 0) return;
    cb.current(null);
    if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
  }, [resetKey]);

  return (
    <div className="mt-4">
      <div ref={box} data-testid="turnstile" className={broken ? "hidden" : "flex min-h-[65px] justify-center"} />
      {broken && (
        <div role="alert" data-testid="turnstile-broken" className="rounded-[3px] border border-rule bg-card2 px-3 py-2.5 text-t13 leading-[1.7] text-ink2">
          <p>{t.captchaLoadFail}</p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-sm mt-2">
            {t.captchaReload}
          </button>
        </div>
      )}
    </div>
  );
}
