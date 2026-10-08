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
  /** Xử lý nền lúc nhập file: queued → rendering → analyzing → ready | failed.
   *  Thiếu = "ready" (dữ liệu cũ). Mặt chưa ready chưa có ảnh ổn định, server trả 409 nếu sửa/quét. */
  status?: "queued" | "rendering" | "analyzing" | "ready" | "failed";
  /** Mã lỗi khi status = "failed" (interrupted / render / decode / unexpected). */
  error?: string;
  /** Việc máy đã tự làm khi nhập: xoay bao nhiêu độ, có cắt gọn không, có chắc hướng không. */
  auto?: {
    rotate: number;
    cropped: boolean;
    detected: number;
    sure: boolean;
    lines: number;
    ratio: number;
    checked: boolean;
    propagated: boolean;
  } | null;
  exif_fixed?: boolean;
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

/** Người đã bấm「Không phải lỗi」cho chỗ đứt chuỗi số dư giữa mặt sổ này và mặt đứng ngay trước nó
 *  (task 1.6). Nhớ cả mặt trước và mức chênh: đổi thứ tự/xoá mặt trước hoặc sửa số làm chỗ đứt khác đi
 *  thì xác nhận cũ hết hiệu lực, không âm thầm che một lỗi mới. */
export type LinkOk = { prev: string; diff: number };

/** Kết quả đã lưu của MỘT mặt sổ — tích luỹ qua nhiều lần quét. */
export type SheetResult = {
  sheet_id: string;
  job_id: string;
  scanned_at: number;
  model: string | null;
  cached: boolean | null;
  cost_usd: number | null;
  blocks: SheetBlock[];
  /** Xem `LinkOk`. Lưu cùng file kết quả của mặt sổ này; quét lại mặt sổ thì mất (dữ liệu mới). */
  link_ok?: LinkOk | null;
};

export type ResultStore = Record<string, SheetResult>;

export type Workspace = {
  id: string;
  book_name: string;
  sheets: Sheet[];
  /** Có ở GET /api/ws/:id — mọi kết quả đã quét, sống qua F5. */
  results?: ResultStore;
};

/** Các ô người dùng sửa được trong một dòng (thứ tự cột trên màn hình). */
export type EditField =
  | "date"
  | "kind"
  | "description"
  | "extra_text"
  | "store_code"
  | "amount_out"
  | "amount_in"
  | "balance";

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
  /** Số thứ tự dòng IN trên sổ (số nguyên). */
  row_no?: number | null;
  sheet_id: string | null;
  /* ── Công soát của người dùng (task 1.1). `status`/`reason` ở trên là dữ kiện của MÁY
     và giao diện không bao giờ sửa chúng; mọi thứ dưới đây là phần người dùng thêm vào. ── */
  /** Danh tính bền của dòng: 12 ký tự hex, sinh một lần, không bao giờ đổi. */
  rid?: string;
  /** Giá trị MÁY ĐỌC của những ô đã bị sửa (chỉ ô đang khác máy; sửa về đúng máy thì xoá khoá). */
  orig?: Partial<Record<EditField, string | number | null>>;
  /** Người đã xác nhận dòng này (bấm ✓). */
  reviewed?: boolean;
  reviewed_at?: number;
  /** Dòng do người thêm (không có giá trị máy). */
  added?: boolean;
  /** Ô do máy SUY RA (vd「Tự tính số dư」), không phải số in trên sổ. */
  inferred?: EditField[];
  /** Chỉ có trong dữ liệu GỬI ĐI XUẤT FILE: dòng đầu của một khối (xem `buildAccounts`). */
  block_start?: boolean;
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
  /** Chỉ có khi web tự tính (`sheetStats` trong lib/review.ts); bản server gửi kèm lần quét thì không. */
  confirmed?: number;
  edited?: number;
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

/** Tài khoản dùng thử dùng chung. Mật khẩu CỐ Ý nằm trong câu trả lời: đây là
 *  tài khoản công khai cho người xem thử. Máy chủ không khai báo thì `accounts`
 *  rỗng và trang đăng nhập không hiện khối đó. */
export type DemoAccount = { email: string; password: string; label: string };
export const fetchDemoAccounts = async () =>
  asJson<{ accounts: DemoAccount[]; scan_limit: number }>(
    await fetch(`${API}/api/auth/demo`, CRED),
  );

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

/** Kết quả tải lên: danh sách mặt sổ vừa lập (còn "queued") + lỗi từng file hỏng. */
export type UploadResult = Workspace & {
  added: string[];
  errors: { file: string; message: string }[];
};

/** Tải file lên CÓ TIẾN ĐỘ. `fetch` không báo được số byte đã gửi nên dùng XMLHttpRequest.
 *
 *  Máy chủ trả lời ngay sau khi nhận đủ file (việc tách trang, tự xoay/cắt chạy nền), nên
 *  thanh tiến độ này chính là toàn bộ thời gian người dùng phải chờ trước khi thấy các thẻ
 *  mặt sổ. `auto=false` tắt bước tự xoay/cắt. */
export function addSheetsWithProgress(
  wsId: string,
  files: File[],
  auto: boolean,
  onProgress: (sent: number, total: number) => void,
): Promise<UploadResult> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/ws/${wsId}/sheets?auto=${auto ? "true" : "false"}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      // Dựng lại thành Response để dùng chung cách báo lỗi (401, mã lỗi…) với mọi lời gọi khác
      const res = new Response(xhr.responseText, {
        status: xhr.status,
        headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "application/json" },
      });
      asJson<UploadResult>(res).then(resolve, reject);
    };
    xhr.send(fd);
  });
}

/** Cho máy tự xoay + cắt gọn những mặt sổ ĐÃ CÓ. Mặt đã quét bị bỏ qua (nằm trong `skipped`). */
export const autoprepSheets = (wsId: string, sheet_ids: string[], force = false) =>
  jsonPost<Workspace & { queued: string[]; skipped: string[] }>(`/api/ws/${wsId}/autoprep`, {
    sheet_ids,
    force,
  });

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
export const saveSheetResult = (
  wsId: string,
  sheetId: string,
  blocks: SheetBlock[],
  linkOk: LinkOk | null = null,
) =>
  fetch(`${API}/api/ws/${wsId}/results/${sheetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, link_ok: linkOk }),
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
export type RowBand = { y0: number; y1: number; method?: "content" | "estimated" };
export type RowBands = {
  bands: RowBand[];
  image_revision?: string;
  ocr_status?: "ready" | "unavailable" | "failed";
  exact: boolean;
  /** Độ nghiêng đo được của trang — vệt đánh dấu nghiêng theo cho khớp chữ. */
  skew_deg: number;
  /** Bề ngang TỜ GIẤY trong ảnh (0..1). Vệt chỉ kéo trong khoảng này: vừa gọn
   *  mắt, vừa để CSS `skewY` xoay đúng quanh tâm giấy — chính là tâm mà
   *  api/rowmap.py đo góc nghiêng. */
  x0: number;
  x1: number;
};

export const rowMap = async (wsId: string, sheetId: string, rows: Pick<Tx, "balance" | "amount_in" | "amount_out" | "is_note">[], revision: string, signal?: AbortSignal) =>
  asJson<RowBands>(
    await fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}/rowmap`, {
      ...CRED, method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, image_revision: revision }), signal,
    }),
  );

/** Fast geometry while local OCR is still working. Every band is estimated. */
export const rowMapEstimate = async (wsId: string, sheetId: string, count: number, signal?: AbortSignal) => {
  const geometry = await asJson<RowBands>(
    await fetch(`${API}/api/ws/${wsId}/sheets/${sheetId}/rowmap?rows=${count}`, { ...CRED, signal }),
  );
  return { ...geometry, exact: false,
    bands: geometry.bands.map(band => ({ ...band, method: "estimated" as const })) };
};

/** Danh sách mặt sổ (nhẹ, không kèm kết quả quét) — hỏi lại mỗi giây khi máy còn xử lý nền. */
export const getSheets = async (wsId: string) =>
  asJson<Pick<Workspace, "sheets">>(await fetch(`${API}/api/ws/${wsId}/sheets`, CRED));

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
      // `block_start` ở dòng đầu mỗi khối: bảng tính chuỗi số dư theo từng khối, nên file xuất cũng
      // phải biết chỗ nối để tô vàng / ghi 確認メモ đúng như màn hình (xem review.split_blocks).
      const rows = block.rows.map((r, i) => (i === 0 ? { ...r, block_start: true } : r));
      if (same) last.transactions.push(...rows);
      else out.push({ ...block.meta, transactions: rows });
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
