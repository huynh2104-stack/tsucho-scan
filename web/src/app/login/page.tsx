"use client";

/**
 * Đăng nhập / đăng ký — WEB_PLAN §3.
 *
 * Người dùng cuối là kế toán lớn tuổi người Nhật nên: chữ to, hai ô nhập, một
 * nút, không có bước thừa.
 *
 * BA ĐIỀU ĐÃ SỬA SAU KHI THỬ LẠI TỪNG BƯỚC:
 *
 * 1. TÀI KHOẢN DÙNG THỬ. Người đến xem — nhất là dân IT hoặc kế toán cẩn thận —
 *    rất ngại tạo tài khoản trên một trang lạ. Nay có sẵn vài tài khoản dùng
 *    chung: bấm một cái là vào thẳng. Cách tự đăng ký vẫn còn nguyên bên dưới.
 *    Máy chủ không khai báo tài khoản nào thì khối này im lặng biến mất.
 * 2. LỖI ĐĂNG KÝ HIỆN ĐÚNG TIẾNG ĐANG XEM. Trước đây máy chủ trả thẳng câu
 *    tiếng Việt, nên người Nhật đăng ký trùng email vẫn thấy「Email này đã có
 *    tài khoản」. Nay máy chủ trả MÃ, câu chữ ghép ở đây.
 * 3. HIỆN / ẨN MẬT KHẨU. Gõ mật khẩu dài mà không nhìn thấy là chỗ sai nhiều
 *    nhất, nhất là trên điện thoại.
 *
 * Chuyển hướng nằm trong `useEffect` chứ không gọi thẳng lúc render — đổi route
 * trong lúc React đang render là lỗi.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, Unauthorized, fetchDemoAccounts, type DemoAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const TRANG_GIOI_THIEU = "https://tsucho-scan.vercel.app/";

export default function LoginPage() {
  const { t } = useT();
  const { user, ready, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hienMk, setHienMk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Giữ NGUYÊN lỗi chứ không giữ câu đã dịch: dịch lúc lưu thì người dùng đổi
  // sang tiếng Nhật vẫn thấy câu tiếng Việt đứng nguyên đó.
  const [err, setErr] = useState<unknown>(null);

  const [demo, setDemo] = useState<{ accounts: DemoAccount[]; scan_limit: number } | null>(
    null,
  );
  const [dangVao, setDangVao] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  // Máy chủ cũ chưa có route này, hoặc chưa khai báo tài khoản nào → bỏ qua im lặng
  useEffect(() => {
    let con = true;
    fetchDemoAccounts()
      .then((d) => con && setDemo(d))
      .catch(() => {});
    return () => {
      con = false;
    };
  }, []);

  async function vao(e: string, mk: string) {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "up") await register(e, mk);
      else await login(e, mk);
      router.replace("/");
    } catch (loi) {
      setErr(loi);
      setBusy(false);
      setDangVao(null);
    }
  }

  /** Server gửi MÃ lỗi vì nó không biết người dùng đang xem tiếng nào; câu chữ
   *  ghép ở đây, ngay lúc VẼ. Lỗi chưa có mã thì hiện nguyên văn. */
  function errText(e: unknown): string {
    if (e instanceof ApiError) {
      const so = (k: string, mac: number) => Number(e.info?.[k] ?? mac);
      if (e.code === "locked")
        return t.authLocked(Math.max(1, Math.ceil(so("seconds", 0) / 60)));
      if (e.code === "email_taken") return t.authEmailTaken;
      if (e.code === "bad_email") return t.authBadEmail;
      if (e.code === "weak_password") return t.authWeakPassword(so("min", 8));
    }
    // Ở TRANG NÀY 401 chỉ có một nghĩa: sai email hoặc sai mật khẩu (server cố
    // ý không nói rõ cái nào, để người ngoài không dò ra email nào có thật).
    if (e instanceof Unauthorized) return t.authBadLogin;
    return e instanceof Error ? e.message : String(e);
  }

  const coDemo = mode === "in" && !!demo && demo.accounts.length > 0;

  return (
    <div className="flex flex-1 items-start justify-center overflow-auto px-4 py-8 sm:px-6 sm:py-12">
      <div
        className={`grid w-full gap-6 lg:gap-10 ${
          coDemo
            ? "max-w-[880px] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start"
            : "max-w-[400px]"
        }`}
      >
        {/* ── Cột trái: lối vào nhanh. Không lặp lại logo — thanh trên đã có. ── */}
        {coDemo && (
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-tight">{t.demoHead}</h2>
            <ul className="m-0 mt-4 grid list-none gap-2 p-0">
              {demo!.accounts.map((tk) => (
                <li key={tk.email}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMode("in");
                      setEmail(tk.email);
                      setPassword(tk.password);
                      setDangVao(tk.email);
                      void vao(tk.email, tk.password);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-rule bg-card px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {tk.label}
                      </span>
                      {/* KHÔNG cắt cụt: có người muốn tự gõ tay chứ không bấm
                          nút, mà mật khẩu bị "…" thì chịu. Cho xuống dòng. */}
                      <span className="block font-mono text-[11.5px] break-all text-ink2">
                        {tk.email} · {tk.password}
                      </span>
                    </span>
                    <span className="flex-none text-[12.5px] font-semibold text-accent">
                      {dangVao === tk.email && busy ? t.authWorking : t.demoUse}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 max-w-[52ch] text-[12.5px] leading-relaxed text-ink2">
              {t.demoNote(demo!.scan_limit)}
            </p>
            <p className="m-0 mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-ink2">
              {t.authPrivacy}
            </p>
            <a
              href={TRANG_GIOI_THIEU}
              className="mt-4 inline-block text-[13px] text-accent underline underline-offset-2"
            >
              {t.authBackHome}
            </a>
          </div>
        )}

        {/* ── Cột phải: ô nhập ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void vao(email, password);
          }}
          className="rounded-2xl border border-rule bg-card p-6 shadow-[var(--shadow)] sm:p-7"
        >
          <h1 className="text-[18px] font-bold tracking-tight">
            {mode === "up" ? t.authHeadUp : t.authHeadIn}
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">
            {coDemo ? t.demoOr : t.authPrivacy}
          </p>

          <label className="mt-5 block text-[13px] font-semibold text-ink2" htmlFor="email">
            {t.authEmail}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-rule bg-card2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
          />

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <label className="block text-[13px] font-semibold text-ink2" htmlFor="password">
              {t.authPassword}
            </label>
            <button
              type="button"
              onClick={() => setHienMk((v) => !v)}
              className="text-[12px] text-accent underline underline-offset-2"
            >
              {hienMk ? t.authHidePw : t.authShowPw}
            </button>
          </div>
          <input
            id="password"
            type={hienMk ? "text" : "password"}
            required
            minLength={8}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-rule bg-card2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent"
          />
          {mode === "up" && <p className="mt-1.5 text-[12px] text-ink2">{t.authPasswordHint}</p>}

          {err !== null && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-lg border border-warnedge bg-warnbg px-3 py-2 text-[13px] text-warnink"
            >
              {errText(err)}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-[15px] font-semibold text-accentink transition-transform active:scale-[0.99] disabled:opacity-60"
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
    </div>
  );
}
