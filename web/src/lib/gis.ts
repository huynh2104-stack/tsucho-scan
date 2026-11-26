/**
 * Nút «Sign in with Google» (Google Identity Services) — phần logic thuần, không React, để test bằng `node --test`.
 * Mọi hàm nhận `win` (mặc định `window`) cho test thay bằng bản giả.
 */

const SRC = "https://accounts.google.com/gsi/client";
const TIMEOUT_MS = 8000;

export type GisId = {
  initialize: (opts: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  disableAutoSelect?: () => void;
};
export type GisWindow = {
  google?: { accounts?: { id?: GisId } };
  document: Document;
};

let loading: Promise<GisId> | null = null;
let initialized = false;

const gisOf = (win: GisWindow): GisId | undefined => win.google?.accounts?.id;

/** Nạp script GIS đúng MỘT lần. Quá 8 giây / lỗi mạng / bị chặn → reject để giao diện giữ nút dự phòng. */
export function loadGis(win: GisWindow = window as unknown as GisWindow): Promise<GisId> {
  const have = gisOf(win);
  if (have) return Promise.resolve(have);
  if (!loading) {
    loading = new Promise<GisId>((resolve, reject) => {
      const fail = () => {
        loading = null;
        reject(new Error("gis"));
      };
      const timer = setTimeout(fail, TIMEOUT_MS);
      const s = win.document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => {
        clearTimeout(timer);
        const id = gisOf(win);
        if (id) resolve(id);
        else fail();
      };
      s.onerror = () => {
        clearTimeout(timer);
        s.remove();
        fail();
      };
      win.document.head.appendChild(s);
    });
  }
  return loading;
}

const NONCE_MAX_AGE_MS = 25 * 60 * 1000; // cookie nonce sống 30 phút; làm mới sớm 5 phút cho chắc
let nonceAt = 0;
let handler: ((credential: string) => void) | null = null;

/** Người nhận credential HIỆN TẠI (component đang gắn). Callback đã đưa cho Google chỉ gọi qua đây nên không bao giờ
 *  trỏ vào component đã gỡ. `null` khi gỡ. */
export function setGisHandler(fn: ((credential: string) => void) | null) {
  handler = fn;
}

/** Cần `initialize` (và xin nonce mới) không: chưa init, hoặc nonce đã quá 25 phút. */
export function gisNeedsInit(now: number = Date.now()): boolean {
  return !initialized || now - nonceAt > NONCE_MAX_AGE_MS;
}

/** `initialize` với nonce của máy chủ. Gọi lại được (Google chỉ cảnh báo) — người gọi quyết định bằng `gisNeedsInit`. */
export function initGis(id: GisId, clientId: string, nonce: string, now: number = Date.now()) {
  initialized = true;
  nonceAt = now;
  id.initialize({
    client_id: clientId,
    callback: (r: { credential?: string }) => {
      if (r?.credential) handler?.(r.credential);
    },
    nonce,
    ux_mode: "popup",
    use_fedcm_for_button: true, // Chrome chặn cookie bên thứ ba vẫn hiện nút «Sign in as <tên>»
    auto_select: false,
    itp_support: true,
    context: "signin",
  });
}

/** Cookie nonce chỉ dùng một lần: sau khi đăng nhập xong phải cấp nonce mới ở lần vào trang đăng nhập kế tiếp. */
export function resetGisInit() {
  initialized = false;
}

export function renderGisButton(
  id: GisId,
  el: HTMLElement,
  o: { theme: "light" | "dark"; lang: string; width: number },
) {
  el.replaceChildren();
  id.renderButton(el, {
    type: "standard",
    theme: o.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: Math.max(200, Math.min(400, Math.floor(o.width))),
    locale: o.lang,
  });
}

/** Gọi khi đăng xuất: lần sau Google không tự chọn lại tài khoản. Vô hại nếu script chưa nạp. */
export function disableGisAutoSelect(
  win: GisWindow | undefined = typeof window === "undefined" ? undefined : (window as unknown as GisWindow),
) {
  try {
    if (win) gisOf(win)?.disableAutoSelect?.();
  } catch {
    /* bỏ qua */
  }
}

/** Test: đưa module về trạng thái ban đầu. */
export function _resetForTest() {
  loading = null;
  initialized = false;
  nonceAt = 0;
  handler = null;
}
