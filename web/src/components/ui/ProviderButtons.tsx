"use client";

import GoogleSignIn from "@/components/ui/GoogleSignIn";
import { useT } from "@/lib/i18n";

/** Nút Google + LINE: THẺ <a> (chuyển trang toàn phần sang nhà cung cấp), không fetch. */
const BASE =
  "flex min-h-[calc(46px*var(--fs))] w-full items-center justify-center gap-3 rounded-[3px] px-4 text-t15 font-bold no-underline transition-[filter] duration-100 hover:brightness-95 active:brightness-90 max-sm:text-t16";

/** Logo «G» 4 màu của Google (SVG theo hướng dẫn thương hiệu Google Sign-In) */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="flex-none">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function ProviderButtons({
  next,
  google,
  googleClientId,
  onError,
  line,
}: {
  /** Đường dẫn nội bộ đã qua `safeNext` */
  next: string;
  google: boolean;
  /** Có → dùng nút Google chính thức (cá nhân hoá), nút chuyển hướng làm dự phòng */
  googleClientId?: string | null;
  onError?: (e: unknown) => void;
  line: boolean;
}) {
  const { t } = useT();
  if (!google && !line) return null;
  const q = `?next=${encodeURIComponent(next)}`;
  const googleLink = (
    <a
      href={`/api/auth/google/start${q}`}
      data-testid="btn-google"
      className={`${BASE} border border-[#747775] bg-white text-[#1f1f1f]`}
    >
      <GoogleG />
      {t.authGoogle}
    </a>
  );
  return (
    <div className="grid gap-2.5">
      {google &&
        (googleClientId ? (
          <GoogleSignIn clientId={googleClientId} next={next} fallback={googleLink} onError={onError ?? (() => {})} />
        ) : (
          googleLink
        ))}
      {line && (
        <a href={`/api/auth/line/start${q}`} data-testid="btn-line" className={`${BASE} bg-[#06C755] text-white`}>
          {/* TODO: thay ô vuông tạm này bằng logo LINE chính thức tải từ LINE Developers (quy định thương hiệu LINE). */}
          <span
            aria-hidden
            className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-white text-[8px] font-bold leading-none text-[#06C755]"
          >
            LINE
          </span>
          {t.authLine}
        </a>
      )}
    </div>
  );
}
