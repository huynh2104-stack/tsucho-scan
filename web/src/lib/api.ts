/**
 * Gọi API FastAPI. Toàn bộ xử lý sổ nằm ở backend (core.scan()) — file này chỉ
 * là ống dẫn. KHÔNG bao giờ đặt GEMINI_API_KEY ở đây: key chỉ nằm ở backend.
 */

/** Địa chỉ API.
 *
 * Để TRỐNG khi triển khai thật: lúc đó FastAPI phục vụ luôn trang web nên web
 * và API cùng một gốc, đường dẫn tương đối (`/api/...`) là đủ — không CORS,
 * cookie phiên là first-party.
 *
 * Lúc phát triển thì Next chạy cổng 3000 còn API cổng 8000, nên mặc định trỏ
 * sang 8000. Muốn ép khác thì đặt `NEXT_PUBLIC_API_URL`.
 */
export const API =
  process.env.NODE_ENV === "production"
    ? // Bản build luôn được chính FastAPI phục vụ → cùng gốc → đường dẫn tương
      // đối. CỐ Ý không đọc biến môi trường ở đây: file `.env.local` của máy
      // lập trình rất dễ bị "nướng" nhầm vào bản build, và khi đó web tải lên
      // được nhưng mọi lời gọi API đều trỏ về `localhost:8000` của máy người
      // xem — hỏng im lặng, rất khó đoán. (Đã dính thật khi thử 03/08/2026.)
      ""
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Một MẶT SỔ — ảnh đơn hoặc một trang tách ra từ PDF. */
export type Sheet = {
  id: string;
  name: string;
  origin: string;
  page: number | null;
  sha256: string;
  duplicate_of: string | null;
  rotation: number;
  cropped: boolean;
  adjusted: boolean;
  warped: boolean;
  scanned: boolean;
  width: number;
  height: number;
  source_ext: string;
  undo: Record<string, unknown> | null;
};

/** Metadata một sổ (ngân hàng) trong kết quả. */
export type AccountMeta = {
  bank_name: string | null;
  store_no: string | null;
  account_no: string | null;
  holder: string | null;
};

/** Một khối dòng cùng một sổ, trong phạm vi một mặt sổ. */
export type SheetBlock = { meta: AccountMeta; rows: Tx[] };

/** Kết quả đã lưu của MỘT mặt sổ — tích luỹ qua nhiều lần quét. */
export type SheetResult = {
  sheet_id: string;
  job_id: string;
  scanned_at: number;
  model: string | null;
  cached: boolean | null;
  cost_usd: number | null;
  blocks: SheetBlock[];
};

export type ResultStore = Record<string, SheetResult>;

export type Workspace = {
  id: string;
  book_name: string;
  sheets: Sheet[];
  /** Có ở GET /api/ws/:id — mọi kết quả đã quét, sống qua F5. */
  results?: ResultStore;
};

export type Tx = {
  date: string | null;
  date_raw: string | null;
  kind: string | null;
  description: string | null;
  extra_text: string | null;
  store_code: string | null;
  amount_out: number | null;
  amount_in: number | null;
  balance: number | null;
  status: "ok" | "fixed" | "check" | "note";
  reason?: string;
  is_note?: boolean;
  row_no?: string | null;
  sheet_id: string | null;
};

export type Account = {
  bank_name: string | null;
  store_no: string | null;
  account_no: string | null;
  holder: string | null;
  transactions: Tx[];
};

export type Verification = {
  index: number;
  bank_name: string | null;
  account_no: string | null;
  rows: number;
  verified: number;
  fixed: number;
  need_check: number;
  level: string;
  chain_ok: boolean;
};

export type PerSheet = {
  sheet_id: string;
  rows: number;
  need_check: number;
  fixed: number;
};

export type ScanPayload = {
  model: string;
  cached: boolean;
  cost_usd: number | null;
  usage: { input_tokens: number; output_tokens: number };
  source_name: string;
  pages: number;
  skipped: string[];
  totals: {
    accounts: number;
    rows: number;
    fixed: number;
    need_check: number;
    chain_ok: boolean;
  };
  verification: Verification[];
  accounts: Account[];
  per_sheet: PerSheet[];
  sheet_ids: string[];
};

export type Job = {
  id: string;
  status: "pending" | "running" | "done" | "error";
  error: string | null;
  error_code?: string;
  error_sheet?: string;
  error_info?: { size_mb?: number; limit_mb?: number };
  sheet_ids: string[];
  result: ScanPayload | null;
};

export type ScanEvent = {
  stage:
    | "start"
    | "page"
    | "skip"
    | "retry"
    | "validate"
    | "done"
    | "finished"
    | "error"
    | "ping";
  message: string;
  /** Mã lỗi để giao diện tự dịch (server không biết đang xem tiếng nào). */
  code?: string;
  /** Tên mặt sổ hỏng — ghép vào câu đã dịch. */
  sheet?: string;
  /** Con số cần ghép vào câu đã dịch (cỡ file, giới hạn...). */
  info?: { size_mb?: number; limit_mb?: number };
  index?: number;
  total?: number;
  label?: string;
  totals?: ScanPayload["totals"];
  cost_usd?: number | null;
  cached?: boolean;
};

/** Chưa đăng nhập / phiên hết hạn. Trang gọi bắt lỗi này để đá về /login. */
export class Unauthorized extends Error {}

/** Lỗi có MÃ để giao diện tự dịch — server không biết đang xem tiếng nào.
 *  `detail` của FastAPI có thể là chuỗi (câu tiếng Việt dự phòng) hoặc object
 *  `{kind, ...}`; chỉ object mới có `code`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly info?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let code: string | undefined;
    let info: Record<string, unknown> | undefined;
    try {
      const body = await res.json();
      if (body?.detail && typeof body.detail === "object") {
        info = body.detail as Record<string, unknown>;
        code = typeof info.kind === "string" ? info.kind : undefined;
        detail = code ?? detail;
      } else if (body?.detail) {
        detail = body.detail;
      }
    } catch {
      /* backend trả về không phải JSON — giữ nguyên mã lỗi */
    }
    if (res.status === 401) throw new Unauthorized(detail);
    throw new ApiError(detail, res.status, code, info);
  }
  return res.json() as Promise<T>;
}

/** BẮT BUỘC ở mọi lời gọi: API nằm ở cổng/tên miền khác nên trình duyệt không
 *  tự gửi cookie phiên nếu không nói rõ. Thiếu chỗ này là 401 toàn tập. */
const CRED = { credentials: "include" } as const;

const jsonPost = <T,>(path: string, body: unknown) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...CRED,
  }).then(asJson<T>);

// ── Tài khoản ──────────────────────────────────────────────────────

export type Me = { id: string; email: string; role: "admin" | "user" };

export const register = (email: string, password: string) =>
  jsonPost<Me & { claimed_workspaces: number }>("/api/auth/register", {
    email,
    password,
  });

export const login = (email: string, password: string) =>
  jsonPost<Me>("/api/auth/login", { email, password });

export const logout = () => jsonPost<{ ok: true }>("/api/auth/logout", {});

/** Ai đang đăng nhập — ném `Unauthorized` nếu chưa. */
export const fetchMe = async () =>
  asJson<Me>(await fetch(`${API}/api/auth/me`, CRED));

export type WorkspaceBrief = {
  id: string;
  book_name: string;
  created_at: number;
  sheets: number;
  scanned: number;
};

export const listWorkspaces = async () =>
  asJson<{ workspaces: WorkspaceBrief[] }>(await fetch(`${API}/api/ws`, CRED));

// ── Không gian làm việc ────────────────────────────────────────────

export const createWorkspace = () => jsonPost<Workspace>("/api/ws", {});

export const getWorkspace = async (id: string) =>
  asJson<Workspace>(await fetch(`${API}/api/ws/${id}`, CRED));

export const renameBook = (id: string, book_name: string) =>
  fetch(`${API}/api/ws/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_name }),
    ...CRED,
  }).then(asJson<Workspace>);

export async function addSheets(wsId: string, files: File[]) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return asJson<Workspace & { added: string[] }>(
    await fetch(`${API}/api/ws/${wsId}/sheets`, { method: "POST", body: fd, ...CRED }),
  );
}

export const deleteSheet = async (wsId: string, sheetId: string) =>
  asJson<Workspace>(
    await fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}`, { method: "DELETE", ...CRED }),
  );

export const reorderSheets = (wsId: string, sheet_ids: string[]) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/reorder`, { sheet_ids });

export const renameSheet = (wsId: string, sheetId: string, name: string) =>
  fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    ...CRED,
  }).then(asJson<Workspace>);

/** Lưu bản ĐÃ SỬA TAY của một mặt sổ.
 *
 * Trước đây các ô sửa chỉ nằm trong bộ nhớ trình duyệt nên F5 hay đăng nhập lại
 * là mất sạch công soát — dùng hàm này để autosave.
 */
export const saveSheetResult = (wsId: string, sheetId: string, blocks: SheetBlock[]) =>
  fetch(`${API}/api/ws/${wsId}/results/${sheetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
    ...CRED,
  }).then(asJson<SheetResult>);

/** `v` đổi theo sha256 để trình duyệt tải lại ảnh sau khi xoay/cắt. */
export const sheetImage = (wsId: string, s: Sheet, thumb = false) =>
  `${API}/api/ws/${wsId}/sheets/${s.id}/image?thumb=${thumb}&v=${s.sha256.slice(0, 12)}`;

// ── Chỉnh ảnh ──────────────────────────────────────────────────────

export const rotateSheets = (wsId: string, sheet_ids: string[], degrees: number) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/rotate`, { sheet_ids, degrees });

export const cropSheet = (
  wsId: string,
  sheet_ids: string[],
  box: { left: number; top: number; right: number; bottom: number },
) => jsonPost<Workspace>(`/api/ws/${wsId}/crop`, { sheet_ids, box });

export const adjustSheets = (
  wsId: string,
  sheet_ids: string[],
  a: { fine_deg: number; brightness: number; contrast: number },
) => jsonPost<Workspace>(`/api/ws/${wsId}/adjust`, { sheet_ids, ...a });

export const undoSheet = (wsId: string, sheet_ids: string[]) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/undo`, { sheet_ids });

export type AutofixStep =
  | { kind: "rotate"; degrees: number }
  | { kind: "tilt"; degrees: number }
  | { kind: "crop"; box: { left: number; top: number; right: number; bottom: number } };

export type AutofixPlan = {
  steps: AutofixStep[];
  gutter: number | null;
  note_180: boolean;
};

export const autofixPlan = async (wsId: string, sheetId: string) =>
  asJson<AutofixPlan>(
    await fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}/autofix`, CRED),
  );

export const autofixApply = (wsId: string, sheetId: string, steps: AutofixStep[]) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/autofix`, { sheet_ids: [sheetId], steps });

/** Bốn góc của vùng cần nắn thẳng, tỉ lệ 0..1, theo thứ tự
 *  trái-trên → phải-trên → phải-dưới → trái-dưới. */
export type Quad = [number, number][];

/** Nắn phối cảnh: kéo tứ giác `corners` thành hình chữ nhật đầy khung. */
export const warpSheet = (
  wsId: string,
  sheetId: string,
  corners: Quad,
  mids?: Quad,
) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/perspective`, {
    sheet_ids: [sheetId],
    corners,
    mids,
  });

export const splitSheet = (wsId: string, sheetId: string, x: number) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/split`, { sheet_ids: [sheetId], x });

/** Dải ảnh của từng dòng — ước lượng từ ảnh, MIỄN PHÍ (xem api/rowmap.py). */
export type RowBands = {
  bands: { y0: number; y1: number }[];
  exact: boolean;
  /** Độ nghiêng đo được của trang — vệt đánh dấu nghiêng theo cho khớp chữ. */
  skew_deg: number;
};

export const rowMap = async (wsId: string, sheetId: string, rows: number) =>
  asJson<RowBands>(
    await fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}/rowmap?rows=${rows}`, CRED),
  );

/** Thêm sổ MẪU (dữ liệu giả lập) — chạy hết luồng mà không gọi model. */
export const addSample = (wsId: string) =>
  jsonPost<Workspace & { added: string[] }>(`/api/ws/${wsId}/sample`, {});

export const resetSheets = (wsId: string, sheet_ids: string[]) =>
  jsonPost<Workspace>(`/api/ws/${wsId}/reset`, { sheet_ids });

// ── Quét & xuất ────────────────────────────────────────────────────

export const startScan = (wsId: string, sheet_ids: string[], no_cache = false) =>
  jsonPost<Job>(`/api/ws/${wsId}/scan`, { sheet_ids, no_cache });

export const getJob = async (id: string) =>
  asJson<Job>(await fetch(`${API}/api/jobs/${id}`, CRED));

/** Dựng danh sách sổ để xuất file, theo đúng thứ tự mặt sổ đang hiện.
 *
 * Gộp hai khối liền nhau cùng ngân hàng + cùng số tài khoản — nhờ vậy quét 2
 * trang của cùng một sổ ở hai lượt khác nhau vẫn ra một sheet Excel liền mạch.
 * Phải khớp logic `results.to_accounts` ở backend.
 */
export function buildAccounts(sheets: Sheet[], store: ResultStore): Account[] {
  const out: Account[] = [];
  for (const sheet of sheets) {
    const data = store[sheet.id];
    if (!data) continue;
    for (const block of data.blocks) {
      const last = out.at(-1);
      const same =
        last &&
        last.bank_name === block.meta.bank_name &&
        last.account_no === block.meta.account_no &&
        block.meta.account_no != null;
      if (same) last.transactions.push(...block.rows);
      else out.push({ ...block.meta, transactions: [...block.rows] });
    }
  }
  return out;
}

/** Xuất file: POST vì phải gửi kèm các ô người dùng vừa sửa tay. */
export async function exportFile(
  wsId: string,
  body: {
    format: "xlsx" | "csv";
    structure: "per_sheet" | "merged";
    add_total: boolean;
    name: string;
    sheet_ids?: string[];
    accounts: Account[];
  },
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API}/api/ws/${wsId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...CRED,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* không phải JSON */
    }
    throw new Error(detail);
  }
  // Tên file thật nằm ở filename*=UTF-8'' (RFC 5987) vì có chữ Việt/Nhật
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  const filename = star
    ? decodeURIComponent(star[1])
    : (plain?.[1] ?? `${body.name}.${body.format}`);
  return { blob: await res.blob(), filename };
}

/** Đẩy blob ra ô tải file của trình duyệt. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nối luồng tiến độ SSE. Trả về hàm đóng kết nối. */
export function listenEvents(
  id: string,
  onEvent: (e: ScanEvent) => void,
  onClose?: () => void,
): () => void {
  // withCredentials: SSE cũng phải mang cookie phiên, không thì 401.
  const es = new EventSource(`${API}/api/jobs/${id}/events`, {
    withCredentials: true,
  });
  es.onmessage = (m) => {
    try {
      const data = JSON.parse(m.data) as ScanEvent;
      if (data.stage !== "ping") onEvent(data);
      if (data.stage === "finished" || data.stage === "error") {
        es.close();
        onClose?.();
      }
    } catch {
      /* bỏ qua gói hỏng, luồng vẫn chạy tiếp */
    }
  };
  es.onerror = () => {
    es.close();
    onClose?.();
  };
  return () => es.close();
}
