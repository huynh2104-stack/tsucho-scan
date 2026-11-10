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
import { useEffect, useState, type CSSProperties } from "react";

import LangMenu from "@/components/LangMenu";
import { BrandMark } from "@/components/ui/Brand";
import Seal from "@/components/ui/Seal";
import { CircleNotch, Eye, EyeSlash, WarningCircle } from "@/components/ui/icons";
import { ApiError, Unauthorized, fetchDemoAccounts, type DemoAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const TRANG_GIOI_THIEU = "https://tsucho-scan.vercel.app/";

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

  const [demo, setDemo] = useState<{
    accounts: DemoAccount[];
    scan_limit: number;
    open_login?: boolean;
  } | null>(null);
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
      if (e.code === "bad_id") return t.authOpenBadId(so("max", 100));
      if (e.code === "weak_password") return t.authWeakPassword(so("min", 8));
    }
    // Ở TRANG NÀY 401 chỉ có một nghĩa: sai email hoặc sai mật khẩu (server cố
    // ý không nói rõ cái nào, để người ngoài không dò ra email nào có thật).
    // Đăng nhập mở thì tên lạ đã được tự tạo tài khoản, nên 401 chắc chắn là: tên đã có người, sai mật khẩu.
    if (e instanceof Unauthorized) return open ? t.authOpenBadLogin : t.authBadLogin;
    return e instanceof Error ? e.message : String(e);
  }

  const coDemo = mode === "in" && !!demo && demo.accounts.length > 0;
  // Bản đang phát triển: nhập tên/mật khẩu tuỳ ý, tên mới tự tạo tài khoản ⇒ không cần ô đăng ký riêng
  const open = mode === "in" && !!demo?.open_login;

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void vao(email, password);
              }}
              className="px-6 pb-6 pt-5"
            >
              <h1 className="text-t22 font-bold">{mode === "up" ? t.authHeadUp : t.authHeadIn}</h1>
              {coDemo && <p className="mt-1 text-t13 leading-[1.6] text-ink2">{t.demoOr}</p>}
              {/* «Bản đang phát triển»: nói rõ không cần email thật / mật khẩu chuẩn. Đứng sau tiêu đề và nhỏ hơn: việc chính vẫn là đăng nhập. */}
              {open && (
                <div role="note" data-testid="dev-notice" className="mt-2 border-b border-rule2 pb-3">
                  <p className="text-t13 font-bold text-ink2">{t.devHead}</p>
                  <p className="mt-0.5 text-t13 leading-[1.7] text-ink2">{t.devBody}</p>
                  <p className="mt-1 text-t12 leading-[1.6] text-pretty text-ink3">{t.devNote}</p>
                </div>
              )}

              <label className="mt-4 block text-t13 font-bold text-ink2" htmlFor="email">
                {open ? t.authOpenId : t.authEmail}
              </label>
              <input
                id="email"
                type={open ? "text" : "email"}
                required
                maxLength={open ? 100 : undefined}
                autoCapitalize="none"
                autoComplete={open ? "username" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field mt-1.5 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
              />

              <div className="mt-3.5 flex items-center justify-between gap-3">
                <label className="block text-t13 font-bold text-ink2" htmlFor="password">
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
                minLength={open ? undefined : 8}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-1 min-h-[calc(42px*var(--fs))] text-t15 max-sm:text-t16"
              />
              {mode === "up" && <p className="mt-1.5 text-t12 text-ink2">{t.authPasswordHint}</p>}
              {open && <p className="mt-1.5 text-t12 text-ink2">{t.authOpenPwHint}</p>}

              {err !== null && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="mt-4 flex items-start gap-2 rounded-[3px] bg-warnbg px-3 py-2 text-t13 leading-[1.6] text-warnink"
                >
                  <WarningCircle size={16} aria-hidden className="mt-[calc(2px*var(--fs))] flex-none" />
                  <span className="min-w-0">{errText(err)}</span>
                </p>
              )}

              <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-5 w-full">
                {busy && <CircleNotch size={18} aria-hidden className="animate-spin motion-reduce:animate-none" />}
                {busy ? t.authWorking : mode === "up" ? t.signUp : t.signIn}
              </button>

              {/* Đăng nhập mở thì tên mới tự tạo tài khoản — nút «đăng ký» chỉ thêm một lựa chọn gây bối rối */}
              {!open && (
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "up" ? "in" : "up");
                    setErr(null);
                  }}
                  className="btn btn-ghost mt-2 w-full whitespace-normal py-1 font-normal text-accent hover:text-accenthover"
                >
                  {mode === "up" ? t.authToIn : t.authToUp}
                </button>
              )}

              {!coDemo && <p className="mt-4 text-t12 leading-[1.7] text-ink3">{t.authPrivacy}</p>}
            </form>
          </div>

          {/* Lối vào nhanh bằng tài khoản dùng chung */}
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
                        {/* KHÔNG cắt cụt: có người muốn tự gõ tay chứ không bấm
                            nút, mà mật khẩu bị "…" thì chịu. Cho xuống dòng. */}
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
              <p className="mt-2 text-t12 leading-[1.7] text-ink2">{t.authPrivacy}</p>
              <a href={TRANG_GIOI_THIEU} className="mt-2.5 inline-block text-t13 text-accent underline hover:text-accenthover">
                {t.authBackHome}
              </a>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
