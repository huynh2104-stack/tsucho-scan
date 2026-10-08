/**
 * Mọi luật THUẦN về dòng kết quả — không React, không alias `@/` để `npm test` chạy được bằng
 * Node. Import giữa file .ts phải ghi đuôi `.ts`. Gồm ba nhóm:
 *
 *  1. Đọc & kiểm giá trị người dùng GÕ TAY (ngày, số tiền). Trước đây ô ngày lưu nguyên chuỗi
 *     người gõ ("2025/4/11") rồi `export.py` gọi `date.fromisoformat` → xuất Excel lỗi 500; ô
 *     tiền dùng `\d` nên số toàn góc của IME tiếng Nhật ("１２３４") bị xoá thành rỗng.
 *  2. Danh tính dòng & giá trị máy đọc (task 1.1): `rid`, `orig`, `inferred`.
 *  3. MỘT định nghĩa duy nhất của「dòng này có cần soát không」(task 1.2). Bảng, bộ đếm, phím n
 *     và huy hiệu cột trái đều gọi các hàm ở đây — không nơi nào được tự tính lại. Bản Python
 *     tương ứng là `review.py` ở gốc repo; hai bản cùng đọc `tests/fixtures/review_cases.json`.
 */

import type { EditField, Tx } from "./api.ts";

// ── Ngày ─────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isISO = (v: unknown): v is string => typeof v === "string" && ISO.test(v);

/** YYYY-MM-DD hợp lệ (đúng số ngày của tháng), hoặc null. */
function toISO(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;    // Date.UTC(y, m, 0) = ngày cuối tháng m
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const dayNo = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Ngày hợp lệ (ISO) của dòng gần nhất phía trước / phía sau — dùng để đoán năm còn thiếu. */
export type NearDates = { prev?: string | null; next?: string | null };

// Năm dương = mốc + năm niên hiệu
const ERA_BASE: Record<string, number> = { R: 2018, 令: 2018, H: 1988, 平: 1988, S: 1925, 昭: 1925 };
const ERA_MAX: Record<string, number> = { R: 99, 令: 99, H: 31, 平: 31, S: 64, 昭: 64 };

/** Sổ in "07-04-11": số đầu là năm niên hiệu nhưng không ghi niên hiệu nào. Chọn năm dương
 *  gần nhất với các dòng bên cạnh; không có dòng bên cạnh thì mặc định 令和 (quá 令和20 thì
 *  coi là 平成/昭和). */
function pickYear(g: number, mo: number, d: number, near: NearDates): string | null {
  const refs = [near.prev, near.next].filter(isISO).map((s) => Number(s.slice(0, 4)));
  if (refs.length === 0) {
    if (g < 1) return null;
    const y = g <= 20 ? 2018 + g : g <= 31 ? 1988 + g : g <= 64 ? 1925 + g : null;
    return y == null ? null : toISO(y, mo, d);
  }
  const cands: number[] = [];                                  // thứ tự = ưu tiên khi hoà
  if (g >= 1) cands.push(2018 + g);
  if (g >= 1 && g <= 31) cands.push(1988 + g);
  if (g >= 1 && g <= 64) cands.push(1925 + g);
  cands.push(2000 + g);                                        // "25/4/11" = 2025
  let best: number | null = null;
  let bestDist = Infinity;
  for (const y of cands) {
    if (!toISO(y, mo, d)) continue;
    const dist = Math.min(...refs.map((r) => Math.abs(y - r)));
    if (dist < bestDist) {
      best = y;
      bestDist = dist;
    }
  }
  return best == null ? null : toISO(best, mo, d);
}

/** "4/11": sổ ghi tháng/ngày, năm suy ra từ dòng bên cạnh (sổ xếp theo thời gian tăng dần). */
function fillYear(mo: number, d: number, near: NearDates): string | null {
  const prev = isISO(near.prev) ? near.prev : null;
  const next = isISO(near.next) ? near.next : null;
  if (!prev && !next) return null;
  const years = new Set<number>();
  if (prev) [0, 1].forEach((k) => years.add(Number(prev.slice(0, 4)) + k));    // cùng năm hoặc sang năm
  if (next) [0, -1].forEach((k) => years.add(Number(next.slice(0, 4)) + k));   // cùng năm hoặc năm trước
  const lo = prev ? dayNo(prev) : -Infinity;
  const hi = next ? dayNo(next) : Infinity;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const y of [...years].sort((a, b) => a - b)) {
    const iso = toISO(y, mo, d);
    if (!iso) continue;
    const n = dayNo(iso);
    const dist = n < lo ? lo - n : n > hi ? n - hi : 0;         // 0 = nằm giữa hai dòng bên cạnh
    // Hoà: có dòng trước thì lấy năm sớm (sát dòng trước), chỉ có dòng sau thì lấy năm muộn
    if (dist < bestDist || (dist === bestDist && !prev)) {
      best = iso;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Chuỗi người dùng gõ → ngày ISO "YYYY-MM-DD", hoặc null nếu không đọc được.
 *
 * Nhận: `2025-04-11` · `2025/4/11` · `2025.4.11` · `2025年4月11日` · `20250411` ·
 * `R7.4.11` · `H31.4.30` · `令和7年4月11日` · `令和元年5月1日` · dạng in trên sổ `07-04-11`
 * (năm niên hiệu, xem `pickYear`) · `4/11` (năm suy từ dòng bên cạnh). Số toàn góc và ký tự
 * niên hiệu ghép (㍻) được chuẩn hoá NFKC trước. Ngày không tồn tại (30/2) → null.
 */
export function parseDateInput(input: string, near: NearDates = {}): string | null {
  const s = input.normalize("NFKC").replace(/\s+/g, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(令和|平成|昭和|[RHS令平昭])(元|\d{1,2})[年./-]?(\d{1,2})[月./-]?(\d{1,2})日?$/i))) {
    const era = m[1][0].toUpperCase();
    const y = m[2] === "元" ? 1 : Number(m[2]);
    if (y < 1 || y > ERA_MAX[era]) return null;
    return toISO(ERA_BASE[era] + y, Number(m[3]), Number(m[4]));
  }
  if ((m = s.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/)) || (m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    return toISO(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = s.match(/^(\d{1,2})[年./-](\d{1,2})[月./-](\d{1,2})日?$/))) {
    return pickYear(Number(m[1]), Number(m[2]), Number(m[3]), near);
  }
  if ((m = s.match(/^(\d{1,2})[月./-](\d{1,2})日?$/))) {
    return fillYear(Number(m[1]), Number(m[2]), near);
  }
  return null;
}

export function nearDates(rows: Pick<Tx, "date">[], index: number): NearDates {
  let prev: string | null = null;
  let next: string | null = null;
  for (let i = index - 1; i >= 0 && prev == null; i--) if (isISO(rows[i].date)) prev = rows[i].date;
  for (let i = index + 1; i < rows.length && next == null; i++) if (isISO(rows[i].date)) next = rows[i].date;
  return { prev, next };
}

/**
 * Người dùng sửa ô ngày của dòng `index`. Trả về dòng MỚI (không đụng `rows`).
 *
 * • đọc được → `date` = ISO;
 * • không đọc được → `date: null`, `date_raw` = chuỗi vừa gõ (vẫn hiện trên ô). Xuất Excel/CSV
 *   không bao giờ đổ vì chuyện này (ghi chuỗi gốc + tô vàng).
 * Hàm này KHÔNG đụng `status`/`reason`: đó là dữ kiện của máy. Dòng còn cần soát hay không do
 * `needsReview` suy ra (ngày không phải ISO ⇒ cần soát; điền được ngày đúng ⇒ lý do 日付不明 hết).
 */
export function applyDateEdit(rows: Tx[], index: number, input: string): Tx {
  const tx = rows[index];
  const text = input.trim();
  const iso = text ? parseDateInput(text, nearDates(rows, index)) : null;
  return iso ? { ...tx, date: iso } : { ...tx, date: null, date_raw: text || null };
}


// ── Danh tính dòng & giá trị máy đọc (task 1.1) ──────────────────────

/** 12 ký tự hex. KHÔNG dùng `crypto.randomUUID()`: nó chỉ có ở ngữ cảnh an toàn (HTTPS/localhost),
 *  còn mở app qua `http://<IP-LAN>` (thử trên điện thoại) thì `getRandomValues` vẫn dùng được. */
export function newRid(): string {
  const b = new Uint8Array(6);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

type Cellish = string | number | null | undefined;
const norm = (v: Cellish) => (v === "" || v === undefined ? null : v);

/** Giá trị đang HIỆN trên ô `f` của dòng. Ô ngày hiện `date`, không đọc được thì hiện chữ gốc. */
export function shown(tx: Tx, f: EditField): string | number | null {
  return norm(f === "date" ? (tx.date ?? tx.date_raw) : tx[f]);
}

/** Sau khi ô `f` vừa bị sửa (`before` → `after`): ghi giá trị MÁY ĐỌC vào `orig` lần đầu sửa ô
 *  đó, xoá khỏi `orig` nếu người dùng sửa về đúng giá trị máy, và bỏ nhãn "máy suy ra" của ô
 *  đó (người đã tự gõ thì không còn là số suy ra). Dòng do người thêm không có giá trị máy. */
function noteEdit(before: Tx, after: Tx, f: EditField): Tx {
  const was = shown(before, f);
  const now = shown(after, f);
  if (was === now) return after;
  const out: Tx = { ...after };
  if (!before.added) {
    const orig = { ...(before.orig ?? {}) };
    if (!(f in orig)) orig[f] = was;
    if (norm(orig[f]) === now) delete orig[f];
    if (Object.keys(orig).length) out.orig = orig;
    else delete out.orig;
  }
  if (out.inferred?.includes(f)) {
    const rest = out.inferred.filter((x) => x !== f);
    if (rest.length) out.inferred = rest;
    else delete out.inferred;
  }
  return out;
}

/**
 * Người dùng sửa ô `field` của dòng `index` thành `value` (chuỗi đã gõ, hoặc số cho ô tiền).
 * Trả về mảng dòng MỚI, hoặc CHÍNH mảng `rows` nếu không có gì đổi — để chỗ gọi khỏi tạo
 * bước Ctrl+Z / lượt autosave rỗng khi người dùng gõ lại đúng giá trị đang có.
 */
export function applyEdit(
  rows: Tx[],
  index: number,
  field: EditField,
  value: string | number | null,
): Tx[] {
  const before = rows[index];
  const edited: Tx =
    field === "date" ? applyDateEdit(rows, index, String(value ?? "")) : ({ ...before, [field]: value } as Tx);
  const after = noteEdit(before, edited, field);
  if (JSON.stringify(after) === JSON.stringify(before)) return rows;
  return rows.map((t, i) => (i === index ? after : t));
}

// ── Số tiền ──────────────────────────────────────────────────────────

export type YenResult = { ok: true; value: number | null } | { ok: false };

/**
 * Chuỗi người dùng gõ vào ô tiền → số nguyên không âm; ô trống hoặc chỉ có gạch ngang → null.
 *
 * Nhận số toàn góc (`１，２３４`), dấu phẩy `,` `，` `、`, ký hiệu `¥` `￥` đầu và `円` cuối.
 * KHÔNG nhận số âm, `▲500`, số lẻ hay chữ: sổ ngân hàng không có số âm, mà lọc ẩu thì `▲500`
 * thành +500 (sai dấu, im lặng). Không đọc được → `{ok:false}` để giao diện giữ giá trị cũ.
 */
export function parseYen(input: string): YenResult {
  let s = input.normalize("NFKC").replace(/\s+/g, "");
  s = s.replace(/^[¥\\]/, "").replace(/円$/, "").replace(/[,、]/g, "");
  if (s === "" || /^[-‐−ー―–—]+$/.test(s)) return { ok: true, value: null };
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false };
  }
  return { ok: false };
}


// ── MỘT định nghĩa duy nhất của「cần soát」(task 1.2) ─────────────────
//
// `status` và `reason` là DỮ KIỆN CỦA MÁY, chụp lúc quét; giao diện không bao giờ sửa chúng.
// Dòng nào cần soát được SUY RA ở đây từ: dòng + chuỗi số dư HIỆN TẠI + việc người đã làm (sửa
// ô, bấm ✓). Trước đây bảng, bộ đếm, phím n, huy hiệu cột trái và file Excel mỗi nơi một kiểu
// nên "Đã soát hết" hiện lên trong khi bảng còn dòng vàng. `review.py` là bản Python của phần
// này; cả hai đọc cùng `tests/fixtures/review_cases.json`.
//
// Chuỗi lý do của engine (validate.py), nối bằng「・」, chia thành các loại:
//
//   loại     nhận dạng                         coi là đã giải quyết khi
//   balance  bắt đầu bằng 残高不一致            chuỗi số dư hiện tại của dòng = OK
//   date     bắt đầu bằng 日付不明              `date` là ISO hợp lệ
//   nobal    残高が読取れず検証不可             dòng đã có `balance` và chuỗi = OK
//   lowconf  低信頼度                          chỉ khi người bấm ✓
//   rowgap   chứa 行抜けの疑い                  chỉ khi người bấm ✓
//   fix      ghi chú tự sửa (…補正 / …分離 …)   không phải việc cần soát (chỉ để biết)
//   other    chuỗi lạ                          chỉ khi người bấm ✓

/** Kết quả cột 検算. "―" (U+2015) = không kiểm được. */
export type Chain = "OK" | "NG" | "―";
export type ReasonKind = "balance" | "date" | "nobal" | "lowconf" | "rowgap" | "fix" | "other";
export type ReasonParams = { diff?: number; from?: number; to?: number; missing?: number };
export type Reason = { kind: ReasonKind; text: string; params: ReasonParams };
/** Thứ tự ưu tiên: note > confirmed > review > fixed > edited > ok. */
export type RowState = "note" | "confirmed" | "review" | "fixed" | "edited" | "ok";
/** Ô mà phím n đặt con trỏ vào. */
export type FocusField = "balance" | "date" | "description";
export type RowInfo = { chk: Chain; state: RowState; need: boolean; field: FocusField };
export type SheetStats = { rows: number; need: number; fixed: number; confirmed: number; edited: number };

const SEP = "・";
const NOT_CHECKABLE: Chain = "―";

/**
 * Cột 検算 của MỘT khối dòng, tính lại từ số đang hiển thị.
 *
 * • dòng có 残高 và có mốc phía trước: trước − 出金 + 入金 = 残高 → "OK", lệch → "NG";
 * • dòng không in 残高: "―", nhưng VẪN cộng dồn để so ở dòng có 残高 kế tiếp (giống engine);
 * • dòng ghi chú (繰越…): "―" và không bao giờ NG, nhưng 残高 của nó VẪN là mốc cho dòng sau;
 * • dòng đầu khối (chưa có mốc): "―".
 */
export function chainChecks(rows: Tx[]): Chain[] {
  let running: number | null = null;
  return rows.map((tx): Chain => {
    if (tx.is_note) {
      if (tx.balance != null) running = tx.balance;
      return NOT_CHECKABLE;
    }
    const move = (tx.amount_in ?? 0) - (tx.amount_out ?? 0);
    if (tx.balance == null) {
      if (running != null) running += move;
      return NOT_CHECKABLE;
    }
    const out: Chain = running == null ? NOT_CHECKABLE : running + move === tx.balance ? "OK" : "NG";
    running = tx.balance;
    return out;
  });
}

// Ghi chú tự sửa của engine. Quy tắc chung「kết thúc bằng 補正 / 分離」đứng đầu để chuỗi tự sửa
// mới theo cùng kiểu vẫn được nhận; các dòng sau liệt kê những chuỗi không theo kiểu đó.
const FIX_PATTERNS: RegExp[] = [
  /(補正|分離)$/,
  /^金額を(入金|出金)列へ移動$/,
  /^金額の列を入替$/,
  /^残高を検算で補正(\(.*\))?$/,
  /^日付は前行と同じ(\(.*\))?$/,
  /^年を(前|後)行から補完$/,
];
const DIFF = /差額\s*([+-]?[0-9,]+)/;
const GAP = /行番号\s*([0-9]+)\s*→\s*([0-9]+)\s*:\s*([0-9]+)\s*行抜けの疑い/;

function kindOf(text: string): ReasonKind {
  if (text.startsWith("残高不一致")) return "balance";
  if (text.startsWith("残高が読取れず検証不可")) return "nobal";
  if (text.startsWith("日付不明")) return "date";
  if (text.startsWith("低信頼度")) return "lowconf";
  if (text.includes("行抜けの疑い")) return "rowgap";
  if (FIX_PATTERNS.some((p) => p.test(text))) return "fix";
  return "other";
}

function paramsOf(kind: ReasonKind, text: string): ReasonParams {
  if (kind === "balance") {
    const m = text.match(DIFF);
    const diff = m ? Number(m[1].replace(/,/g, "")) : NaN;
    return Number.isFinite(diff) ? { diff } : {};
  }
  if (kind === "rowgap") {
    const m = text.match(GAP);
    if (m) return { from: Number(m[1]), to: Number(m[2]), missing: Number(m[3]) };
  }
  return {};
}

/** Chuỗi `reason` của máy → danh sách `{kind, text, params}` (bỏ phần tử rỗng). */
export function parseReasons(reason: string | null | undefined): Reason[] {
  const out: Reason[] = [];
  for (const part of (reason ?? "").split(SEP)) {
    const text = part.trim();
    if (!text) continue;
    const kind = kindOf(text);
    out.push({ kind, text, params: paramsOf(kind, text) });
  }
  return out;
}

function resolved(r: Reason, tx: Tx, chk: Chain): boolean {
  switch (r.kind) {
    case "balance":
      return chk === "OK";
    case "date":
      return isISO(tx.date);
    case "nobal":
      return tx.balance != null && chk === "OK";
    default:
      return r.kind === "fix";          // lowconf / rowgap / other: chỉ ✓ mới gỡ được
  }
}

/**
 * Các lý do CHƯA được giải quyết của dòng (thứ cần hiện ở cột 確認メモ).
 *
 * Chỉ xét lý do của máy khi `status === "check"`. Riêng ngày: dòng thường mà `date` không phải
 * ISO (người xoá hoặc gõ hỏng — giao diện không còn gắn lý do vào dòng) thì thêm một lý do
 * `date` tổng hợp để cột 確認メモ vẫn giải thích được vì sao dòng đang vàng.
 */
export function openReasons(tx: Tx, chk: Chain): Reason[] {
  if (tx.is_note) return [];
  const out = tx.status === "check" ? parseReasons(tx.reason).filter((r) => !resolved(r, tx, chk)) : [];
  if (!isISO(tx.date) && !out.some((r) => r.kind === "date")) {
    out.unshift({ kind: "date", text: "日付不明", params: {} });
  }
  return out;
}

/**
 * Dòng này còn cần người soát không. Thứ tự luật (dừng ở luật đầu tiên khớp):
 *
 *  1. dòng ghi chú                                → không
 *  2. người đã bấm ✓ (`reviewed`)                  → không   (✓ thắng mọi cờ, kể cả NG)
 *  3. chuỗi số dư hiện tại lệch (NG)               → có
 *  4. dòng người thêm tay (`added`), chưa ✓        → có      (máy chưa từng kiểm dòng này)
 *  5. ngày trống / không phải ISO                  → có
 *  6. `status !== "check"`                         → không
 *  7. còn lý do chưa giải quyết (bảng ở trên)      → có
 *  8. `status === "check"` mà không có lý do nào  → có
 */
export function needsReview(tx: Tx, chk: Chain): boolean {
  if (tx.is_note) return false;
  if (tx.reviewed) return false;
  if (chk === "NG") return true;
  if (tx.added) return true;
  if (openReasons(tx, chk).length > 0) return true;
  return tx.status === "check" && parseReasons(tx.reason).length === 0;
}

export function rowState(tx: Tx, chk: Chain): RowState {
  if (tx.is_note) return "note";
  if (tx.reviewed) return "confirmed";
  if (needsReview(tx, chk)) return "review";
  if (tx.status === "fixed") return "fixed";
  if (Object.keys(tx.orig ?? {}).length > 0 || (tx.inferred?.length ?? 0) > 0) return "edited";
  return "ok";
}

/** Ô mà phím n đặt con trỏ vào: chuỗi lệch → 残高; ngày hỏng → ngày; còn lại → 摘要. */
export function focusField(tx: Tx, chk: Chain): FocusField {
  if (chk === "NG") return "balance";
  const kinds = new Set(openReasons(tx, chk).map((r) => r.kind));
  if (kinds.has("balance")) return "balance";
  if (kinds.has("date")) return "date";
  if (kinds.has("nobal")) return "balance";
  return "description";
}

/** Mỗi dòng của một khối → `{chk, state, need, field}`, tính chuỗi số dư đúng MỘT lượt. */
export function analyzeRows(rows: Tx[]): RowInfo[] {
  const chk = chainChecks(rows);
  return rows.map((tx, i) => ({
    chk: chk[i],
    state: rowState(tx, chk[i]),
    need: needsReview(tx, chk[i]),
    field: focusField(tx, chk[i]),
  }));
}

/** Thống kê một mặt sổ. Dòng ghi chú không được tính vào `rows`. */
export function sheetStats(blocks: { rows: Tx[] }[]): SheetStats {
  const s: SheetStats = { rows: 0, need: 0, fixed: 0, confirmed: 0, edited: 0 };
  for (const b of blocks) {
    for (const { state } of analyzeRows(b.rows)) {
      if (state === "note") continue;
      s.rows += 1;
      if (state === "review") s.need += 1;
      else if (state === "fixed" || state === "confirmed" || state === "edited") s[state] += 1;
    }
  }
  return s;
}

/**
 * Bấm ✓ / bỏ ✓ cho dòng `index`. `now` = epoch giây (truyền vào để test được). Trả về CHÍNH
 * `rows` nếu không có gì đổi (dòng ghi chú, hoặc đã ở đúng trạng thái đó) — để chỗ gọi khỏi tạo
 * bước Ctrl+Z / lượt autosave rỗng. Bỏ ✓ thì xoá hẳn cả hai khoá cho dữ liệu gọn.
 */
export function setReviewed(rows: Tx[], index: number, on: boolean, now: number): Tx[] {
  const tx = rows[index];
  if (!tx || tx.is_note || !!tx.reviewed === on) return rows;
  let next: Tx;
  if (on) {
    next = { ...tx, reviewed: true, reviewed_at: now };
  } else {
    next = { ...tx };
    delete next.reviewed;
    delete next.reviewed_at;
  }
  return rows.map((t, i) => (i === index ? next : t));
}


// ── Hành động quanh「đã soát」(task 1.3) ──────────────────────────────

/** Bấm ✓ cho MỌI dòng chưa ✓ của một khối (trừ dòng ghi chú). Trả về CHÍNH `rows` nếu chẳng có
 *  dòng nào cần đổi, để chỗ gọi khỏi tạo bước Ctrl+Z / lượt autosave rỗng. */
export function setAllReviewed(rows: Tx[], now: number): Tx[] {
  let changed = false;
  const out = rows.map((tx) => {
    if (tx.is_note || tx.reviewed) return tx;
    changed = true;
    return { ...tx, reviewed: true, reviewed_at: now };
  });
  return changed ? out : rows;
}

/** Số dòng CHƯA ✓ mà chuỗi số dư hiện tại đang lệch (NG) — thứ cần cảnh báo trước khi xác nhận cả mặt sổ. */
export function ngCount(rows: Tx[]): number {
  const chk = chainChecks(rows);
  return rows.filter((tx, i) => !tx.is_note && !tx.reviewed && chk[i] === "NG").length;
}

/** Dòng trống do người thêm tay: máy chưa từng đọc nên `added: true` và cần ✓ mới hết cờ. */
export function blankRow(sheetId: string | null, rid: string = newRid()): Tx {
  return {
    rid,
    added: true,
    date: null,
    date_raw: null,
    kind: null,
    description: null,
    extra_text: null,
    store_code: null,
    amount_out: null,
    amount_in: null,
    balance: null,
    status: "ok",
    reason: "",
    sheet_id: sheetId,
  };
}

/** Chèn `row` NGAY DƯỚI dòng `index` (index ≥ cuối → thêm vào cuối; index < 0 → lên đầu). */
export function insertRowAfter(rows: Tx[], index: number, row: Tx): Tx[] {
  const at = Math.min(Math.max(index + 1, 0), rows.length);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

/** Trả ô `field` của dòng `index` về GIÁ TRỊ MÁY ĐỌC (đi qua `applyEdit` nên `orig[field]` tự xoá).
 *  Dòng không có `orig[field]` thì trả CHÍNH `rows`. */
export function restoreField(rows: Tx[], index: number, field: EditField): Tx[] {
  const orig = rows[index]?.orig;
  if (!orig || !(field in orig)) return rows;
  return applyEdit(rows, index, field, orig[field] ?? null);
}

/** Tên cột in trên sổ — dùng trong lời chú «máy đọc → người sửa». */
export const FIELD_LABEL: Record<EditField, string> = {
  date: "年月日",
  kind: "区分",
  description: "摘要",
  amount_out: "お支払",
  amount_in: "お預り",
  balance: "差引残高",
  store_code: "取扱店",
  extra_text: "備考",
};

const FIELD_ORDER = Object.keys(FIELD_LABEL) as EditField[];

export type EditChange = { field: EditField; from: string | number | null; to: string | number | null };

/** Các ô người đã sửa của dòng: giá trị máy đọc → giá trị đang hiện, theo thứ tự cột. */
export function editChanges(tx: Tx): EditChange[] {
  const orig = tx.orig ?? {};
  return FIELD_ORDER.filter((f) => f in orig).map((f) => ({ field: f, from: norm(orig[f]), to: shown(tx, f) }));
}
