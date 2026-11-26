/** Đường dẫn «đi tiếp sau khi đăng nhập» chỉ được là đường dẫn NỘI BỘ — chặn chuyển hướng ra trang lạ (open redirect).
 *  Trình duyệt bỏ tab/xuống dòng khi phân tích URL nên «/\t/evil.com» thành «//evil.com»: loại hẳn ký tự điều khiển và khoảng trắng. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("://") || raw.includes("\\")) return "/";
  try {
    const u = new URL(raw, "http://x");
    if (u.origin !== "http://x") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

/** Khoá localStorage lưu thông tin tài khoản thử một chạm (Audit 3: gom một chỗ để logout xoá sạch). */
export const TRIAL_KEY = "tsucho.trial";

let _cachedToken: { path: string; token: string; at: number } | null = null;

/** Token trong thư nằm sau dấu # (không gửi lên máy chủ/log); dự phòng `?token=` cho link cũ.
 *  Đọc xong thì xoá khỏi thanh địa chỉ. Chỉ gọi trong useEffect (lúc render tĩnh không có `location`).
 *  (Audit 3) Giữ cache ngắn theo pathname để React StrictMode chạy effect 2 lần ở dev không làm mất token. */
export function takeTokenFromUrl(): string {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
  const token = fromHash ?? new URLSearchParams(location.search).get("token") ?? "";
  if (token) {
    _cachedToken = { path: location.pathname, token, at: Date.now() };
    history.replaceState(null, "", location.pathname);
    return token;
  }
  if (_cachedToken && _cachedToken.path === location.pathname && Date.now() - _cachedToken.at < 2000) {
    return _cachedToken.token;
  }
  return "";
}

/** Test: xoá cache token tạm. */
export function _resetTokenCacheForTest() {
  _cachedToken = null;
}

export type PasswordRules = {
  len: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  ok: boolean;
};

/** (Audit 3) Kiểm tra quy tắc mật khẩu đồng bộ với `api/auth.py` (`check_password_strength`):
 *  8–128 ký tự, ít nhất 1 chữ in hoa (A–Z), 1 chữ thường (a–z) và 1 chữ số (0–9). */
export function checkPasswordRules(pw: string): PasswordRules {
  const len = pw.length >= 8 && pw.length <= 128;
  const upper = /[A-Z]/.test(pw);
  const lower = /[a-z]/.test(pw);
  const digit = /[0-9]/.test(pw);
  return { len, upper, lower, digit, ok: len && upper && lower && digit };
}
