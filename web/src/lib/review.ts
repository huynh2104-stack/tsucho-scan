/**
 * Đọc & kiểm giá trị người dùng GÕ TAY vào bảng kết quả — logic THUẦN (không React, không
 * alias `@/`) để `npm test` chạy được bằng Node. Import giữa file .ts phải ghi đuôi `.ts`.
 *
 * Vì sao có: trước đây ô ngày lưu nguyên chuỗi người gõ ("2025/4/11") rồi `export.py` gọi
 * `date.fromisoformat` → xuất Excel lỗi 500; ô tiền dùng `\d` nên số toàn góc của IME tiếng
 * Nhật ("１２３４") bị xoá thành rỗng mà không báo gì.
 */

import type { Tx } from "./api.ts";

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

/** Lý do gắn cho dòng có ngày người dùng gõ mà máy không đọc được. Bắt đầu bằng `日付不明`
 *  — cùng tiền tố với lý do của engine (validate.py) nên bước gom định nghĩa "cần soát" ở
 *  task 1.2 coi nó là một loại với nhau. */
export const DATE_MARK = "日付不明(手入力)";

const DATE_REASON = /^日付不明/;
const SEP = "・";

/**
 * Người dùng sửa ô ngày của dòng `index`. Trả về dòng MỚI (không đụng `rows`).
 *
 * • đọc được → `date` = ISO, và gỡ lý do 日付不明 (cả của engine lẫn của lần gõ trước);
 * • không đọc được → `date: null`, `date_raw` = chuỗi vừa gõ (vẫn hiện trên ô), dòng chuyển
 *   sang "cần soát" (vàng). Xuất Excel/CSV không bao giờ đổ vì chuyện này.
 * Dòng ghi chú (繰越…) thì ngày để trống cũng được, không bị tô vàng.
 */
export function applyDateEdit(rows: Tx[], index: number, input: string): Tx {
  const tx = rows[index];
  const text = input.trim();
  const iso = text ? parseDateInput(text, nearDates(rows, index)) : null;

  const parts = (tx.reason ?? "").split(SEP).filter(Boolean);
  const rest = parts.filter((p) => !DATE_REASON.test(p));
  const hadDateReason = rest.length !== parts.length;

  if (iso) {
    const resolved = hadDateReason && rest.length === 0 && tx.status === "check";
    return { ...tx, date: iso, reason: rest.join(SEP), status: resolved ? "ok" : tx.status };
  }
  if (tx.is_note) return { ...tx, date: null, date_raw: text || null };
  return {
    ...tx,
    date: null,
    date_raw: text || null,
    status: "check",
    reason: [...rest, DATE_MARK].join(SEP),
  };
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
