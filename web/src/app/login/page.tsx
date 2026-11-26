"use client";

/**
 * Đăng nhập / đăng ký — WEB_PLAN §3.
 *
 * Người dùng cuối là kế toán lớn tuổi người Nhật nên: chữ to, hai ô nhập, một
 * nút, không có bước thừa.
 *
 * Đợt C (KE_HOACH_DANG_NHAP): Google · LINE · email (đăng ký phải xác minh qua thư) và khung «お試し（登録不要）»
 * riêng cho khách xem thử. Đăng ký KHÔNG đăng nhập — chỉ báo «đã gửi thư».
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

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type CSSProperties } from "react";

import LangMenu from "@/components/LangMenu";
import { BrandMark } from "@/components/ui/Brand";
import Seal from "@/components/ui/Seal";
import ProviderButtons from "@/components/ui/ProviderButtons";
import Turnstile from "@/components/ui/Turnstile";
import { CheckCircle, CircleNotch, Eye, EyeSlash, WarningCircle } from "@/components/ui/icons";
import {
  ApiError,
  Unauthorized,
  fetchAuthMethods,
  fetchDemoAccounts,
  resendVerify,
  type AuthMethods,
  type DemoAccount,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/authnext";
import { useT } from "@/lib/i18n";

const TRANG_GIOI_THIEU = "https://tsucho-scan.com/";

/* Dòng 19 đến 24 của sổ mẫu, đúng số trong samples/fukuoka.json; ảnh public/login/passbook-rows.jpg cắt và nắn
   từ samples/fukuoka.jpg. Bỏ dòng 18 vì dòng đó có tên bên chuyển khoản. Dòng 23 là dòng báo của ATM nên chuỗi đứt:
   103,609 + 60,000 không ra 60,059. Dòng 24 lại khớp từ dòng 22. Máy đọc nhầm ザンガカ, ở đây viết đúng như ảnh in: ザンダカ. */
const ROWS = [
  { no: 19, date: "04.10.11", kind: "振込", desc: "ハイパーウオーレツト ジ", out: "", in: "14,351", bal: "14,847" },
  { no: 20, date: "04.10.11", kind: "RTコウフリ", desc: "ラインペイ", out: "14,000", in: "", bal: "847" },
  { no: 21, date: "04.10.27", kind: "給与", desc: "", out: "", in: "132,762", bal: "133,609" },
  { no: 22, date: "04.10.31", kind: "CDカード", desc: "E-NET", out: "30,000", in: "", bal: "103,609" },
  { no: 23, date: "04.11.24", kind: "タダイマノ", desc: "オトリヒキ (ニユウキン ザンダカ", out: "", in: "60,000", bal: "60,059" },
  { no: 24, date: "04.11.02", kind: "RTコウフリ", desc: "ラインペイ", out: "60,000", in: "", bal: "43,609" },
];
const OPEN_ROW = 23;

/* Thời điểm tính theo --i của .row-in / .chain-draw (mỗi đơn vị 16ms): chuỗi chạy xuống, dừng hở ở dòng 23,
   dấu ấn xuống, rồi dòng 24 nối tiếp. Khung trên ảnh và con dấu bám theo cùng nhịp đó. */
const rowBeat = (i: number) => i * 6 + (i >= 5 ? 26 : 0);
const FRAME_DELAY = "[animation-delay:440ms]!";
/* Tắt chuyển động thì .seal-press không chạy, nên độ nghiêng của dấu phải đặt bằng thuộc tính khác */
const SEAL_DELAY = "[animation-delay:620ms]! motion-reduce:-rotate-9";

/** Ảnh sổ thật và sổ đã đọc đặt cạnh nhau. Không phải ảnh chụp giao diện: bảng này là bảng thật, chuỗi là chuỗi thật. */
function Showcase() {
  const { t } = useT();

  return (
    <section className="on-ink thin-scroll hidden min-h-0 flex-col overflow-y-auto bg-shell px-10 py-8 text-shellink lg:flex xl:px-14 xl:py-10">
      <div className="flex flex-none items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-t16 font-bold">{t.appName}</span>
      </div>

      <div className="my-auto w-full max-w-[820px] py-8 2xl:max-w-[960px]">
        <h2 className="text-t28 font-bold leading-[1.4] xl:text-t36">{t.loginHead}</h2>
        <p className="mt-3 max-w-[50ch] text-t15 leading-[1.8] text-shellink2">{t.loginSub}</p>

        <figure className="mt-8">
          <div className="relative w-[90%] overflow-hidden rounded-[3px] shadow-lift">
            {/* Ảnh tĩnh nhỏ, app xuất tĩnh không có bộ tối ưu ảnh nên dùng thẳng <img> */}
            <img src="/login/passbook-rows.jpg" width={1200} height={291} alt={t.loginPhotoAlt} className="block h-auto w-full" />
            <span
              aria-hidden
              className={`absolute inset-x-[0.6%] top-[63.6%] h-[15.4%] animate-[fadeIn_160ms_ease-out_both] rounded-[2px] border-[1.5px] border-shu motion-reduce:animate-none ${FRAME_DELAY}`}
            />
          </div>

          <div className="chain-draw relative z-10 -mt-3 ml-auto w-[94%] overflow-hidden rounded-[3px] bg-card text-ink shadow-lift">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-head text-left text-t12 text-headink">
                  <th scope="col" className="h-[calc(28px*var(--fs))] whitespace-nowrap py-0 pl-5 pr-2 font-bold">行</th>
                  <th scope="col" className="whitespace-nowrap px-2 font-bold">年月日</th>
                  <th scope="col" className="px-2 font-bold">摘要</th>
                  <th scope="col" className="whitespace-nowrap px-2 text-right font-bold">お支払</th>
                  <th scope="col" className="whitespace-nowrap px-2 text-right font-bold">お預り</th>
                  <th scope="col" className="whitespace-nowrap py-0 pl-2 pr-3 text-right font-bold">差引残高</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => {
                  const broken = r.no === OPEN_ROW;
                  return (
                    <tr
                      key={r.no}
                      className={`border-t border-rule2 text-t13 2xl:text-t14 ${broken ? "row-closed" : "row-in"}`}
                      style={{ "--i": i * 6 } as CSSProperties}
                    >
                      <td
                        className="chain num h-[calc(32px*var(--fs))] py-0 pr-2 text-ink3 2xl:h-[calc(38px*var(--fs))]"
                        data-link={broken ? "open" : i === ROWS.length - 1 ? "last" : "ok"}
                        style={{ "--i": rowBeat(i) } as CSSProperties}
                      >
                        {broken && (
                          <span className="absolute left-0 top-1/2 z-[1] -translate-y-1/2 rounded-full bg-card">
                            <Seal size={20} press className={SEAL_DELAY} />
                          </span>
                        )}
                        {r.no}
                      </td>
                      <td className="num whitespace-nowrap px-2">{r.date}</td>
                      <td className="w-full max-w-0 truncate px-2">
                        {r.kind}
                        {r.desc && <span className="ml-2 text-ink2">{r.desc}</span>}
                      </td>
                      <td className="num whitespace-nowrap px-2 text-right">{r.out}</td>
                      <td className="num whitespace-nowrap px-2 text-right">{r.in}</td>
                      <td className="num whitespace-nowrap py-0 pl-2 pr-3 text-right font-bold">{r.bal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <figcaption className="ml-auto mt-3 w-[94%] text-t12 leading-[1.6] text-shellink2">{t.loginCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

const PRIVACY_URL = "https://tsucho-scan.com/privacy";
const TERMS_URL = "https://tsucho-scan.com/terms";
const TRIAL_KEY = "tsucho.trial";
const ERR_MARK = "mt-4 flex items-start gap-2 rounded-[3px] bg-warnbg px-3 py-2 text-t13 leading-[1.6] text-warnink";
const LABEL = "block text-t13 font-bold text-ink2";
const INPUT = "field mt-1.5 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16";

function LoginInner() {
  const { t, lang } = useT();
  const { user, ready, login, register, trial, trialNew } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const authError = sp.get("auth_error");

  const [mode, setMode] = useState<"in" | "up" | "sent">(sp.get("tab") === "register" ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hienMk, setHienMk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Giữ NGUYÊN lỗi chứ không giữ câu đã dịch: dịch lúc lưu thì người dùng đổi
  // sang tiếng Nhật vẫn thấy câu tiếng Việt đứng nguyên đó.
  const [err, setErr] = useState<unknown>(null);

  // Khung «お試し»
  const [tId, setTId] = useState("");
  const [tPw, setTPw] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const [tErr, setTErr] = useState<unknown>(null);
  // Tài khoản thử đã cất trong trình duyệt này → bấm nút là vào lại đúng tài khoản đó
  const [saved, setSaved] = useState<{ id: string; password: string } | null>(null);
  const [oldOpen, setOldOpen] = useState(false);
  const [tCap, setTCap] = useState<string | null>(null);
  const [tCapKey, setTCapKey] = useState(0);

  // Gửi lại thư xác nhận: khoá 60 giây
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  // Chống bot Cloudflare (đăng ký + gửi lại thư). Token dùng một lần: tăng capKey sau mỗi lần gửi để lấy token mới.
  const [cap, setCap] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);
  const siteKey = methods?.turnstile_site_key ?? null;
  const capBlock = !!siteKey && !cap;
  const [demo, setDemo] = useState<{ accounts: DemoAccount[]; scan_limit: number } | null>(null);
  const [dangVao, setDangVao] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRIAL_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v.id === "string" && typeof v.password === "string") setSaved(v);
    } catch {
      /* trình duyệt chặn localStorage: coi như chưa có */
    }
  }, []);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, router, next]);

  // Máy chủ cũ chưa có route này → bỏ qua im lặng: khung お試し hiện theo mặc định, nút Google/LINE ẩn
  useEffect(() => {
    let con = true;
    fetchAuthMethods()
      .then((m) => con && setMethods(m))
      .catch(() => {});
    fetchDemoAccounts()
      .then((d) => con && setDemo(d))
      .catch(() => {});
    return () => {
      con = false;
    };
  }, []);

  useEffect(() => {
    if (methods && !methods.email && mode === "up") setMode("in");
  }, [methods, mode]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function vao(e: string, mk: string) {
    if (mode === "up" && capBlock) return;
    setErr(null);
    setResent(false);
    setBusy(true);
    try {
      if (mode === "up") {
        try {
          await register(e, lang, cap ?? undefined);
        } finally {
          setCapKey((k) => k + 1);
        }
        setMode("sent");
        setWait(60);
        setBusy(false);
        return;
      }
      await login(e, mk);
      router.replace(next);
    } catch (loi) {
      setErr(loi);
      setBusy(false);
      setDangVao(null);
    }
  }

  /** Một chạm: có tài khoản cũ của trình duyệt này thì vào lại (không cần Turnstile); không thì máy tự tạo mới. */
  async function motCham() {
    setTErr(null);
    setTBusy(true);
    try {
      if (saved) {
        try {
          await trial(saved.id, saved.password);
          router.replace(next);
          return;
        } catch (loi) {
          if (!(loi instanceof Unauthorized)) throw loi;
          forgetTrial(); // tài khoản cũ đã bị xoá → tạo mới
        }
      }
      let cred: { id: string; password: string };
      try {
        cred = await trialNew(tCap ?? undefined);
      } finally {
        setTCapKey((k) => k + 1);
      }
      try {
        localStorage.setItem(TRIAL_KEY, JSON.stringify(cred));
      } catch {
        /* không cất được thì vẫn vào, chỉ là lần sau tạo mới */
      }
      router.replace(next);
    } catch (loi) {
      setTErr(loi);
      setTBusy(false);
    }
  }

  function forgetTrial() {
    try {
      localStorage.removeItem(TRIAL_KEY);
    } catch {
      /* bỏ qua */
    }
    setSaved(null);
  }

  async function thu() {
    setTErr(null);
    setTBusy(true);
    try {
      await trial(tId.trim(), tPw);
      router.replace(next);
    } catch (loi) {
      setTErr(loi);
      setTBusy(false);
    }
  }

  async function guiLai() {
    if (capBlock) return;
    setErr(null);
    setWait(60);
    setResent(true);
    try {
      await resendVerify(email, lang, cap ?? undefined);
    } catch (loi) {
      // Máy chủ luôn trả 200 trừ khi chống bot từ chối; lỗi mạng thì người dùng bấm lại sau 60 giây
      if (loi instanceof ApiError && loi.code === "captcha") {
        setWait(0);
        setResent(false);
        setErr(loi);
      }
    } finally {
      setCapKey((k) => k + 1);
    }
  }

  /** Server gửi MÃ lỗi vì nó không biết người dùng đang xem tiếng nào; câu chữ
   *  ghép ở đây, ngay lúc VẼ. Lỗi chưa có mã thì hiện nguyên văn. */
  function errText(e: unknown, trialBox: boolean): string {
    if (e instanceof ApiError) {
      const so = (k: string, mac: number) => Number(e.info?.[k] ?? mac);
      if (e.code === "locked") return t.authLocked(Math.max(1, Math.ceil(so("seconds", 0) / 60)));
      if (e.code === "unverified") return t.authUnverified;
      if (e.code === "state") return t.authErrState;
      if (e.code === "provider") return t.authErrProvider;
      if (e.code === "email_unverified") return t.authErrEmailUnverified;
      if (e.code === "captcha") return t.authCaptchaFail;
      if (e.code === "trial_off") return t.authTrialOff;
      if (e.code === "trial_new_limit") return t.authTrialNewLimit;
      if (e.code === "email_taken") return t.authEmailTaken;
      if (e.code === "bad_email") return t.authBadEmail;
      if (e.code === "bad_id") return t.authOpenBadId(so("max", 100));
      if (e.code === "weak_password") return t.authWeakPassword(so("min", 8));
    }
    // 401 chỉ có một nghĩa: sai email/mật khẩu (server cố ý không nói rõ cái nào). Ở khung お試し thì
    // tên lạ đã tự tạo tài khoản nên 401 chắc chắn là: ID đã có người dùng + sai mật khẩu.
    if (e instanceof Unauthorized) return trialBox ? t.authOpenBadLogin : t.authBadLogin;
    return e instanceof Error ? e.message : String(e);
  }

  const errCode = err instanceof ApiError ? err.code : undefined;
  const coDemo = !!demo && demo.accounts.length > 0;
  const showTrial = methods ? methods.trial : true;
  // Máy chủ chưa cài gửi thư (thiếu RESEND_API_KEY) → ẩn đăng ký + quên mật khẩu: báo «đã gửi» mà thư không tới còn tệ hơn không có nút
  const emailOn = methods ? methods.email : true;
  const trialLimit = methods?.trial_limit ?? 5;
  const keepDays = methods?.trial_keep_days ?? 7;
  const tCapBlock = !saved && !!siteKey && !tCap;
  const authErrText =
    authError === "cancelled"
      ? t.authErrCancelled
      : authError === "state"
        ? t.authErrState
        : authError === "email_unverified"
          ? t.authErrEmailUnverified
          : authError
            ? t.authErrProvider
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,56fr)_minmax(0,44fr)]">
      <Showcase />

      {/* Màn hẹp: phần trưng bày thu lại thành một dải mực, ô nhập đứng đầu trang */}
      <header className="on-ink flex h-12 flex-none items-center justify-between bg-shell pl-4 pr-1 text-shellink lg:hidden">
        <span className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="text-t15 font-bold">{t.appName}</span>
        </span>
        <LangMenu className="max-sm:h-10 max-sm:w-10 max-sm:px-0" />
      </header>

      <div className="thin-scroll relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-page">
        <div className="absolute right-4 top-3 hidden lg:block">
          <LangMenu />
        </div>

        <div className="m-auto w-full max-w-[484px] px-4 py-6 sm:py-10 lg:pt-14">
          <div className="overflow-hidden rounded-[3px] bg-card shadow-ply">
            {mode === "sent" ? (
              <div className="px-6 pb-6 pt-5" data-testid="register-sent">
                <h1 className="flex items-center gap-2 text-t22 font-bold">
                  <CheckCircle size={24} aria-hidden className="flex-none text-accent" />
                  {t.authSentHead}
                </h1>
                <p className="num mt-3 break-all text-t16 font-bold">{email}</p>
                <p className="mt-2 text-t14 leading-[1.7] text-ink2">{t.authSentBody}</p>
                <p className="mt-1 text-t14 leading-[1.7] text-ink2">{t.authSentSetPw}</p>
                <p className="mt-1 text-t13 leading-[1.7] text-ink2">{t.authSentSpam}</p>
                {siteKey && <Turnstile siteKey={siteKey} onToken={setCap} resetKey={capKey} />}
                {err !== null && (
                  <p role="alert" className={ERR_MARK}>
                    <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                    <span className="min-w-0">{errText(err, false)}</span>
                  </p>
                )}
                <button
                  type="button"
                  disabled={wait > 0 || capBlock}
                  onClick={() => void guiLai()}
                  className="btn btn-lg mt-5 w-full"
                >
                  {wait > 0 ? t.authResendWait(wait) : t.authResend}
                </button>
                {resent && wait > 0 && (
                  <p role="status" className="mt-2 text-t13 text-okink">
                    {t.authResent}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMode("in");
                    setPassword("");
                  }}
                  className="btn btn-ghost mt-2 w-full whitespace-normal py-1 font-normal text-accent hover:text-accenthover"
                >
                  {t.backToLogin}
                </button>
              </div>
            ) : (
              <div className="px-6 pb-6 pt-5">
                <h1 className="sr-only">{mode === "up" ? t.authHeadUp : t.authHeadIn}</h1>

                {authErrText && (
                  <p role="alert" data-testid="auth-error" className={`${ERR_MARK} mb-4 mt-0`}>
                    <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                    <span className="min-w-0">{authErrText}</span>
                  </p>
                )}

                <ProviderButtons
                  next={next}
                  google={!!methods?.google}
                  googleClientId={methods?.google_client_id}
                  onError={setErr}
                  line={!!methods?.line}
                />

                {(methods?.google || methods?.line) && (
                  <div className="my-4 flex items-center gap-3 text-t13 text-ink3" role="separator">
                    <span className="h-px flex-1 bg-rule2" />
                    <span>{t.authOrEmail}</span>
                    <span className="h-px flex-1 bg-rule2" />
                  </div>
                )}

                {/* Hai thẻ: đăng nhập / đăng ký */}
                {emailOn && (
                <div role="tablist" className="mb-4 grid grid-cols-2 border-b border-rule">
                  {(["in", "up"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      data-testid={m === "in" ? "tab-in" : "tab-up"}
                      onClick={() => {
                        setMode(m);
                        setErr(null);
                      }}
                      className={`-mb-px min-h-[calc(42px*var(--fs))] cursor-pointer border-b-2 text-t15 font-bold transition-colors duration-100 ${
                        mode === m ? "border-accent text-ink" : "border-transparent text-ink3 hover:text-ink"
                      }`}
                    >
                      {m === "in" ? t.signIn : t.signUp}
                    </button>
                  ))}
                </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void vao(email, password);
                  }}
                >
                  <label className={LABEL} htmlFor="email">
                    {t.authEmail}
                  </label>
                  <input
                    id="email"
                    type="text"
                    inputMode="email"
                    required
                    autoCapitalize="none"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT}
                  />

                  {mode === "in" && (
                  <>
                  <div className="mt-3.5 flex items-center justify-between gap-3">
                    <label className={LABEL} htmlFor="password">
                      {t.authPassword}
                    </label>
                    <button
                      type="button"
                      onClick={() => setHienMk((v) => !v)}
                      className="btn btn-ghost btn-sm -mr-2 font-normal text-ink2 max-sm:min-h-10"
                    >
                      {hienMk ? <EyeSlash size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                      {hienMk ? t.authHidePw : t.authShowPw}
                    </button>
                  </div>
                  <input
                    id="password"
                    type={hienMk ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field mt-1 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
                  />
                  </>
                  )}
                  {mode === "up" && <p className="mt-2 text-t13 leading-[1.7] text-ink2">{t.authSignupNote}</p>}

                  {err !== null && (
                    <div role="alert" aria-live="assertive" className={ERR_MARK}>
                      <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                      <div className="min-w-0">
                        <span>{errText(err, false)}</span>
                        {errCode === "unverified" && (
                          <>
                            {siteKey && <Turnstile siteKey={siteKey} onToken={setCap} resetKey={capKey} />}
                            <button
                              type="button"
                              disabled={wait > 0 || capBlock}
                              onClick={() => void guiLai()}
                              className="btn btn-sm mt-2 block whitespace-normal"
                            >
                              {wait > 0 ? t.authResendWait(wait) : t.authResend}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {mode === "up" && siteKey && <Turnstile siteKey={siteKey} onToken={setCap} resetKey={capKey} />}
                  <button
                    type="submit"
                    disabled={busy || (mode === "up" && capBlock)}
                    className="btn btn-primary btn-lg mt-5 w-full"
                  >
                    {busy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
                    {busy ? t.authWorking : mode === "up" ? t.signUp : t.signIn}
                  </button>
                </form>

                {mode === "in" && emailOn && (
                  <a href="/forgot/" className="mt-3 inline-block text-t13 text-accent underline hover:text-accenthover">
                    {t.authForgotLink}
                  </a>
                )}

                <p className="mt-4 text-t12 text-ink3">
                  <a href={PRIVACY_URL} className="underline hover:text-ink2">
                    {t.authPrivacyLink}
                  </a>
                  {" · "}
                  <a href={TERMS_URL} className="underline hover:text-ink2">
                    {t.authTermsLink}
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Cửa cho khách xem sản phẩm: khung riêng, nền giấy nhạt, viền mảnh. KHÔNG giấu. */}
          {showTrial && (
            <section data-testid="trial-box" className="mt-5 rounded-[3px] border border-rule bg-card2 px-6 pb-5 pt-4">
              <h2 className="text-t16 font-bold">{t.trialHead}</h2>
              <p className="mt-1 text-t13 leading-[1.7] text-ink2">{t.trialNote(trialLimit, keepDays)}</p>
              {!saved && siteKey && <Turnstile siteKey={siteKey} onToken={setTCap} resetKey={tCapKey} />}
              {tErr !== null && !oldOpen && (
                <p role="alert" aria-live="assertive" className={ERR_MARK}>
                  <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                  <span className="min-w-0">{errText(tErr, true)}</span>
                </p>
              )}
              <button
                type="button"
                data-testid="trial-onetap"
                disabled={tBusy || tCapBlock}
                onClick={() => void motCham()}
                className="btn btn-primary btn-lg mt-4 w-full"
              >
                {tBusy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
                {tBusy ? t.authWorking : saved ? t.trialContinue : t.trialOneTap}
              </button>
              {saved && (
                <button
                  type="button"
                  disabled={tBusy}
                  onClick={forgetTrial}
                  className="btn btn-ghost btn-sm mt-1 w-full font-normal text-accent hover:text-accenthover"
                >
                  {t.trialFresh}
                </button>
              )}

              <button
                type="button"
                aria-expanded={oldOpen}
                onClick={() => {
                  setOldOpen((v) => !v);
                  setTErr(null);
                }}
                className="mt-3 cursor-pointer text-t12 text-ink3 underline hover:text-ink2"
              >
                {t.trialOld}
              </button>
              {oldOpen && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void thu();
                  }}
                >
                  <label className={`${LABEL} mt-3`} htmlFor="trial-id">
                    {t.trialId}
                  </label>
                  <input
                    id="trial-id"
                    type="text"
                    required
                    maxLength={100}
                    autoCapitalize="none"
                    autoComplete="username"
                    value={tId}
                    onChange={(e) => setTId(e.target.value)}
                    className={INPUT}
                  />
                  <label className={`${LABEL} mt-3`} htmlFor="trial-password">
                    {t.authPassword}
                  </label>
                  <input
                    id="trial-password"
                    type={hienMk ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={tPw}
                    onChange={(e) => setTPw(e.target.value)}
                    className={INPUT}
                  />
                  {tErr !== null && (
                    <p role="alert" aria-live="assertive" className={ERR_MARK}>
                      <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                      <span className="min-w-0">{errText(tErr, true)}</span>
                    </p>
                  )}
                  <button type="submit" data-testid="trial-submit" disabled={tBusy} className="btn btn-lg mt-4 w-full">
                    {tBusy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
                    {tBusy ? t.authWorking : t.trialGo}
                  </button>
                </form>
              )}
            </section>
          )}

          {/* Tài khoản dùng chung (nếu máy chủ còn khai báo) */}
          {coDemo && (
            <section className="mt-6">
              <h2 className="text-t15 font-bold">{t.demoHead}</h2>
              <ul className="mt-2.5 divide-y divide-rule2 overflow-hidden rounded-[3px] bg-card shadow-ply">
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
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left outline-offset-[-2px] transition-colors duration-100 enabled:hover:bg-card2 enabled:active:bg-card3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-t14 font-bold">{tk.label}</span>
                        {/* KHÔNG cắt cụt: có người muốn tự gõ tay chứ không bấm nút, mà mật khẩu bị "…" thì chịu. */}
                        <span className="num block text-t12 break-all text-ink2">
                          {tk.email} · {tk.password}
                        </span>
                      </span>
                      <span className="flex-none text-t13 font-bold text-accent">
                        {dangVao === tk.email && busy ? t.authWorking : t.demoUse}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-t12 leading-[1.7] text-ink2">{t.demoNote(demo!.scan_limit)}</p>
            </section>
          )}

          <p className="mt-4 text-t12 leading-[1.7] text-ink3">{t.authPrivacy}</p>
          <a href={TRANG_GIOI_THIEU} className="mt-2.5 inline-block text-t13 text-accent underline hover:text-accenthover">
            {t.authBackHome}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
