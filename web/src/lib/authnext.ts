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

/** Token trong thư nằm sau dấu # (không gửi lên máy chủ/log); dự phòng `?token=` cho link cũ.
 *  Đọc xong thì xoá khỏi thanh địa chỉ. Chỉ gọi trong useEffect (lúc render tĩnh không có `location`). */
export function takeTokenFromUrl(): string {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
  const token = fromHash ?? new URLSearchParams(location.search).get("token") ?? "";
  if (token) history.replaceState(null, "", location.pathname);
  return token;
}
