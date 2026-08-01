"use client";

/**
 * Khung phải: kết quả trình bày GIỐNG MẶT SỔ THẬT, sửa được trực tiếp.
 *
 * Nguồn dữ liệu là KHO TÍCH LUỸ theo từng mặt sổ (`ResultStore`), không phải
 * kết quả của một lần quét. Nhờ vậy quét thêm mặt mới không xoá kết quả các mặt
 * đã quét trước — đó từng là bug làm người dùng tưởng mất dữ liệu.
 *
 * Hai chế độ:
 *   • Trang hiện tại — CHỈ mặt sổ đang xem.
 *   • Dạng danh sách — nối tất cả; chỉ chế độ này mới cuộn tới mặt được chọn,
 *     và cuộn bằng scrollTop của CHÍNH khung này (không kéo cả trang).
 *
 * Tên cột giữ tiếng Nhật + chú thích bản địa ngay cạnh (WEB_PLAN §8).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, type Dict } from "@/lib/i18n";
import type { AccountMeta, ResultStore, Sheet, Tx } from "@/lib/api";

const yen = (v: number | null) => (v == null ? "" : v.toLocaleString("en-US"));
const parseYen = (s: string) => {
  const digits = s.replace(/[^\d-]/g, "");
  return digits === "" || digits === "-" ? null : parseInt(digits, 10);
};

export type OptCols = { store: boolean; extra: boolean; kind: boolean };
export type ViewMode = "page" | "list";

/** Địa chỉ một dòng trong kho: mặt sổ nào, khối nào, dòng thứ mấy. */
export type TxRef = { sheet: string; block: number; row: number };
export type EditFn = (ref: TxRef, field: keyof Tx, value: string | number | null) => void;
export type RowActionFn = (ref: TxRef) => void;

/** Cột 検算 tính LẠI từ dữ liệu đang hiển thị — sửa ô là đổi ngay. */
function checkColumn(rows: Tx[]): ("OK" | "NG" | "―")[] {
  let prev: number | null = null;
  return rows.map((t) => {
    if (t.balance == null) return "―";
    let out: "OK" | "NG" | "―" = "―";
    if (prev != null) {
      const want = prev - (t.amount_out ?? 0) + (t.amount_in ?? 0);
      out = want === t.balance ? "OK" : "NG";
    }
    prev = t.balance;
    return out;
  });
}

function Th({
  jp,
  vn,
  align = "left",
  width,
}: {
  jp: string;
  vn: string;
  align?: "left" | "right" | "center";
  width?: string;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-rule bg-head px-2 py-2 text-[12px] font-semibold text-headink ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      {jp}
      {vn && <span className="ml-1 font-normal opacity-70">({vn})</span>}
    </th>
  );
}

/* ── Đi lại giữa các ô bằng phím mũi tên ─────────────────────────────
   Người soát dữ liệu dùng bàn phím nhanh hơn chuột nhiều lần (WEB_PLAN §7.1),
   mà trước đây muốn sang ô kế phải bấm chuột từng ô một.

   Luật quan trọng: mũi tên trái/phải CHỈ nhảy ô khi con trỏ đã ở kịch đầu hoặc
   kịch cuối chữ — đứng giữa chữ thì nó vẫn là phím di chuyển con trỏ bình
   thường, nếu không thì không sửa được chữ trong ô nữa. */

const CELL_SEL = "input[data-cell]";

function focusCell(el: HTMLInputElement, place: "start" | "end" | "all") {
  el.focus();
  const n = el.value.length;
  if (place === "all") el.setSelectionRange(0, n);
  else if (place === "start") el.setSelectionRange(0, 0);
  else el.setSelectionRange(n, n);
}

/** Chuyển focus sang ô kề. Trả về true nếu đã chuyển (để chặn hành vi mặc định). */
function moveCell(el: HTMLInputElement, key: string): boolean {
  const root = el.closest<HTMLElement>("[data-grid]");
  const tr = el.closest("tr");
  if (!root || !tr) return false;

  const cellsOf = (row: Element) =>
    Array.from(row.querySelectorAll<HTMLInputElement>(CELL_SEL));

  const here = cellsOf(tr);
  const col = here.indexOf(el);
  if (col < 0) return false;

  // Lấy theo thứ tự trong DOM nên đi xuyên qua cả các thẻ sổ khác ở chế độ
  // danh sách — không dừng lại ở cuối mỗi bảng.
  const rows = Array.from(root.querySelectorAll("tr[data-row]"));
  const r = rows.indexOf(tr);

  if (key === "ArrowUp" || key === "ArrowDown") {
    const next = rows[r + (key === "ArrowDown" ? 1 : -1)];
    if (!next) return false;
    const cells = cellsOf(next);
    // Cột cuối của dòng kia có thể ít hơn (không có ô nào) → lùi về ô gần nhất
    const target = cells[Math.min(col, cells.length - 1)];
    if (!target) return false;
    focusCell(target, "all");
    return true;
  }

  const step = key === "ArrowRight" ? 1 : -1;
  const sibling = here[col + step];
  if (sibling) {
    focusCell(sibling, step === 1 ? "start" : "end");
    return true;
  }

  // Hết hàng → xuống dòng dưới (hoặc lên dòng trên) như khi đọc chữ
  const nextRow = rows[r + step];
  if (!nextRow) return false;
  const cells = cellsOf(nextRow);
  const edge = step === 1 ? cells[0] : cells[cells.length - 1];
  if (!edge) return false;
  focusCell(edge, step === 1 ? "start" : "end");
  return true;
}

/* ── Bôi đen nhiều ô rồi copy sang Excel ─────────────────────────────
   Vùng chọn là một HÌNH CHỮ NHẬT trong lưới ô, y như bảng tính. Toạ độ dòng
   lấy theo thứ tự `tr` trong DOM nên chọn được xuyên qua nhiều thẻ sổ. */

export type Rect = { r0: number; c0: number; r1: number; c1: number };

const norm = (a: { r: number; c: number }, b: { r: number; c: number }): Rect => ({
  r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r),
  c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c),
});

/** Địa chỉ (dòng, cột) của ô dưới con trỏ. */
function cellAddr(target: EventTarget | null, root: HTMLElement) {
  const el = target instanceof Element ? target : null;
  const input = el?.closest<HTMLInputElement>("input[data-cell]");
  const tr = input?.closest("tr");
  if (!input || !tr) return null;
  const r = Array.from(root.querySelectorAll("tr[data-row]")).indexOf(tr);
  const c = Array.from(tr.querySelectorAll("input[data-cell]")).indexOf(input);
  return r < 0 || c < 0 ? null : { r, c };
}

/** Vùng chọn → văn bản TAB, dán vào Excel là nhảy đúng ô.
 *
 * Cột tiền bỏ dấu phẩy ngăn nghìn: để nguyên "1,100" thì Excel nhận thành
 * CHỮ, cộng trừ không ra. Cột chữ giữ nguyên vì dấu phẩy là nội dung thật.
 */
function toTSV(root: HTMLElement, rect: Rect): string {
  const rows = Array.from(root.querySelectorAll("tr[data-row]"));
  const out: string[] = [];
  for (let r = rect.r0; r <= rect.r1 && r < rows.length; r++) {
    const cells = Array.from(
      rows[r].querySelectorAll<HTMLInputElement>("input[data-cell]"),
    );
    const line: string[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) {
      const el = cells[c];
      const raw = el?.value ?? "";
      const v = el?.dataset.money !== undefined ? raw.replace(/,/g, "") : raw;
      line.push(v.replace(/[\t\r\n]/g, " "));
    }
    out.push(line.join("\t"));
  }
  return out.join("\r\n");
}

/** Ô sửa được — trông như chữ thường cho tới khi bấm vào. */
function Cell({
  value,
  align = "left",
  money = false,
  tone,
  placeholder,
  picked,
  readOnly,
  onCommit,
}: {
  value: string;
  align?: "left" | "right" | "center";
  money?: boolean;
  /** Ô chỉ để chép (cột 行) — không cho gõ, nhưng vẫn bôi đen được. */
  readOnly?: boolean;
  tone?: string;
  placeholder?: string;
  /** Nằm trong vùng bôi đen — tô nền để thấy đang chọn tới đâu. */
  picked?: boolean;
  onCommit: (v: string) => void;
}) {
  return (
    <input
      key={value}
      data-cell
      data-money={money ? "" : undefined}
      readOnly={readOnly}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === "Enter") {
          el.blur();
          return;
        }
        if (e.key === "Escape") {
          el.value = value;
          el.blur();
          return;
        }
        // Ctrl+←/→ (nhảy theo từ) và Shift+←/→ (bôi đen) vẫn là việc của ô
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const at = el.selectionStart ?? 0;
          const to = el.selectionEnd ?? 0;
          const whole = at === 0 && to === el.value.length && el.value.length > 0;
          // Bôi đen một phần → để nguyên cho phím thu gọn vùng chọn.
          // Bôi đen CẢ ô (vừa nhảy tới bằng ↑/↓) thì cho đi tiếp luôn.
          if (at !== to && !whole) return;
          if (!whole && (e.key === "ArrowLeft" ? at > 0 : at < el.value.length)) return;
        } else if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
          return;
        }

        if (moveCell(el, e.key)) e.preventDefault();
      }}
      inputMode={money ? "numeric" : undefined}
      className={`w-full rounded border border-transparent px-1 py-0.5 placeholder:text-ink3/60 hover:border-rule focus:border-accent focus:bg-card focus:outline-none ${
        picked ? "bg-accent/25" : "bg-transparent"
      } ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""} ${
        money ? "tnum" : ""
      } ${readOnly ? "tnum cursor-default text-[10.5px] text-ink3" : ""} ${tone ?? ""}`}
    />
  );
}

function Row({
  tx,
  n,
  cols,
  chk,
  ref_,
  dim,
  sel,
  rowIdx,
  pick,
  t,
  onEdit,
  onDelete,
  onSelect,
}: {
  tx: Tx;
  n: number;
  cols: OptCols;
  chk: "OK" | "NG" | "―";
  ref_: TxRef;
  /** Đang lọc và dòng này không khớp → làm mờ thay vì ẩn, để không mất mạch sổ. */
  dim: boolean;
  sel: boolean;
  /** Số thứ tự dòng trong TOÀN lưới — toạ độ hàng của vùng bôi đen. */
  rowIdx: number;
  /** Cột thứ `c` của dòng này có nằm trong vùng bôi đen không. */
  pick: (row: number, col: number) => boolean;
  t: Dict;
  onEdit: EditFn;
  onDelete: RowActionFn;
  onSelect: RowActionFn;
}) {
  const flag = tx.status === "check" || chk === "NG";
  const fixed = tx.status === "fixed";
  const note = tx.is_note;

  // Thứ tự các ô SỬA ĐƯỢC trong một dòng = toạ độ cột của vùng bôi đen.
  // Phải khớp đúng thứ tự <Cell> bên dưới, kể cả khi tắt/bật cột phụ.
  let k = 0;
  const cRow = k++;                     // cột 行 — chép được, không sửa được
  const cDate = k++;
  const cKind = cols.kind ? k++ : -1;
  const cDesc = k++;
  const cOut = k++;
  const cIn = k++;
  const cBal = k++;
  const cStore = cols.store ? k++ : -1;
  const cExtra = cols.extra ? k++ : -1;
  const on = (c: number) => pick(rowIdx, c);

  return (
    <tr
      data-row={`${ref_.sheet}:${ref_.block}:${ref_.row}`}
      onClick={() => onSelect(ref_)}
      /* Đi bằng bàn phím cũng phải kéo theo vệt đỏ trên ảnh, không thì gõ tới
         dòng nào mà ảnh vẫn đứng ở dòng cũ. Sự kiện focus có nổi bọt lên tr. */
      onFocus={() => onSelect(ref_)}
      className={`group cursor-default border-b border-rule2 ${
        note ? "italic text-ink3" : ""
      } ${n % 2 === 0 ? "bg-band" : ""} ${dim ? "opacity-25" : ""} ${
        sel ? "outline outline-2 -outline-offset-2 outline-danger" : ""
      } hover:bg-accentpale/30`}
    >
      {/* Cột 行 KHÔNG sửa được nhưng vẫn phải bôi đen chép được: người dùng
          muốn dán sang Excel kèm số dòng để đối chiếu với sổ giấy.
          `readOnly` + con trỏ mặc định → nhìn và cư xử y như ô chữ thường. */}
      <td className="w-8 border-r border-rule2 bg-card2 px-0.5">
        <Cell
          value={tx.row_no || String(n).padStart(2, "0")}
          align="center"
          readOnly
          picked={on(cRow)}
          onCommit={() => {}}
        />
      </td>
      <td className="whitespace-nowrap px-1 py-0.5">
        <Cell
          value={tx.date ?? tx.date_raw ?? ""}
          picked={on(cDate)}
          onCommit={(v) => onEdit(ref_, "date", v || null)}
        />
      </td>
      {cols.kind && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[12.5px]">
          <Cell
            value={tx.kind ?? ""}
            picked={on(cKind)}
            onCommit={(v) => onEdit(ref_, "kind", v || null)}
          />
        </td>
      )}
      <td className={`px-1 py-0.5 ${flag ? "bg-warnbg" : ""}`}>
        <Cell
          value={tx.description ?? ""}
          tone={flag ? "text-warnink" : ""}
          picked={on(cDesc)}
          onCommit={(v) => onEdit(ref_, "description", v || null)}
        />
      </td>
      {/* Rút = đỏ, Gửi = xanh ngọc. Ô trống hiện gạch ngang cho dễ dò */}
      <td className={`whitespace-nowrap px-1 py-0.5 ${fixed ? "bg-okbg" : ""}`}>
        <Cell
          value={yen(tx.amount_out)}
          align="right"
          money
          placeholder="–"
          tone={tx.amount_out != null ? "font-medium text-outink" : ""}
          picked={on(cOut)}
          onCommit={(v) => onEdit(ref_, "amount_out", parseYen(v))}
        />
      </td>
      <td className={`whitespace-nowrap px-1 py-0.5 ${fixed ? "bg-okbg" : ""}`}>
        <Cell
          value={yen(tx.amount_in)}
          align="right"
          money
          placeholder="–"
          tone={tx.amount_in != null ? "font-medium text-inink" : ""}
          picked={on(cIn)}
          onCommit={(v) => onEdit(ref_, "amount_in", parseYen(v))}
        />
      </td>
      <td className={`whitespace-nowrap px-1 py-0.5 ${flag ? "bg-warnbg" : ""}`}>
        <Cell
          value={yen(tx.balance)}
          align="right"
          money
          placeholder="–"
          tone={`font-semibold ${flag ? "text-warnink" : ""}`}
          picked={on(cBal)}
          onCommit={(v) => onEdit(ref_, "balance", parseYen(v))}
        />
      </td>
      {cols.store && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[11.5px] text-ink2">
          <Cell
            value={tx.store_code ?? ""}
            picked={on(cStore)}
            onCommit={(v) => onEdit(ref_, "store_code", v || null)}
          />
        </td>
      )}
      {cols.extra && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[11.5px] text-ink2">
          <Cell
            value={tx.extra_text ?? ""}
            picked={on(cExtra)}
            onCommit={(v) => onEdit(ref_, "extra_text", v || null)}
          />
        </td>
      )}
      <td
        className={`w-9 text-center text-[10.5px] font-bold ${
          chk === "NG" ? "text-warnink" : chk === "OK" ? "text-inink" : "text-ink3"
        }`}
        title={tx.reason || undefined}
      >
        {chk}
      </td>
      <td className="max-w-[140px] truncate px-2 py-0.5 text-[11px]" title={tx.reason}>
        {tx.status === "check" && <span className="text-warnink">⚠ {tx.reason}</span>}
        {fixed && <span className="text-inink">✓ {tx.reason}</span>}
      </td>
      <td className="w-7 px-0.5">
        <button
          onClick={() => onDelete(ref_)}
          title={t.deleteRow}
          className="flex h-5 w-5 items-center justify-center rounded text-[13px] leading-none text-ink3 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

/** Một thẻ sổ: đầu thẻ, bảng, chân thẻ có tổng.
 *
 * ĐỊNH NGHĨA Ở MỨC MODULE, không lồng trong ReviewPane: component khai báo bên
 * trong một component khác là kiểu MỚI sau mỗi lần render, khiến React tháo và
 * dựng lại toàn bộ cây con — mất vị trí cuộn và mất focus khi đang gõ.
 */
function AccountCard({
  meta,
  rows,
  refs,
  index,
  ofTotal,
  fallbackTitle,
  sourceLabel,
  cols,
  head,
  t,
  filter,
  onEdit,
  onDeleteRow,
  onAddRow,
  onAutoBalance,
  selected,
  onSelectRow,
  rowBase,
  pick,
}: {
  meta: AccountMeta;
  rows: Tx[];
  refs: TxRef[];
  index: number;
  /** Tổng số sổ trong mặt này — chỉ >1 mới cần đánh số cho khỏi lẫn. */
  ofTotal: number;
  fallbackTitle: string;
  /** Tên file gốc + số trang, để biết dòng này đến từ đâu. */
  sourceLabel: string;
  cols: OptCols;
  head: React.ReactNode;
  t: Dict;
  filter: string;
  onEdit: EditFn;
  onDeleteRow: RowActionFn;
  onAddRow: (ref: TxRef) => void;
  onAutoBalance: (sheet: string, block: number) => void;
  selected: TxRef | null;
  onSelectRow: (ref: TxRef) => void;
  /** Số thứ tự dòng đầu tiên của khối này trong TOÀN lưới. */
  rowBase: number;
  pick: (row: number, col: number) => boolean;
}) {
  const chk = checkColumn(rows);
  const real = rows.filter((r) => !r.is_note);
  const needCheck = chk.filter((c) => c === "NG").length;

  const q = filter.trim().toLowerCase();
  const matches = (tx: Tx) =>
    !q ||
    `${tx.description ?? ""} ${tx.kind ?? ""}`.toLowerCase().includes(q);

  // Đang lọc thì tổng tính theo CÁC DÒNG KHỚP — đó là điều người dùng muốn biết
  const counted = q ? real.filter(matches) : real;
  const totalOut = counted.reduce((s, r) => s + (r.amount_out ?? 0), 0);
  const totalIn = counted.reduce((s, r) => s + (r.amount_in ?? 0), 0);
  const lastBal = [...rows].reverse().find((r) => r.balance != null)?.balance;

  return (
    <section className="m-2.5 overflow-hidden rounded-xl border border-rule bg-card shadow-[var(--shadow)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-rule bg-card2 px-3 py-2">
        {/* Chỉ đánh số khi MỘT mặt sổ chứa nhiều sổ khác nhau — nếu không, con
            số này nằm cạnh số thứ tự mặt sổ và gây nhầm hai thứ khác nhau. */}
        {ofTotal > 1 && (
          <span className="tnum flex flex-none items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10.5px] font-bold text-accentink">
            {t.accountNo(index + 1, ofTotal)}
          </span>
        )}
        <div className="min-w-0">
        <p className="truncate text-[13.5px] font-bold">
          {/* Không có bìa sổ thì model không biết tên ngân hàng. Ghi tên mặt sổ
              thay vì "(chưa rõ ngân hàng)" — vừa gọn vừa cho biết đang xem gì. */}
          {meta.bank_name || fallbackTitle}
          {meta.account_no && (
            <span className="ml-1.5 font-normal text-ink3">· {meta.account_no}</span>
          )}
        </p>
        {/* Tên file gốc + số trang — cho biết dòng này lấy từ đâu ra */}
        <p className="truncate text-[10.5px] text-ink3">{sourceLabel}</p>
        </div>
        <span className="flex-1" />
        {q && (
          <span className="tnum rounded-md bg-accentpale px-2 py-0.5 text-[11px] font-semibold text-accent">
            {t.matched(counted.length)}
          </span>
        )}
        {needCheck > 0 && (
          <span className="tnum rounded-md bg-warnbg px-2 py-0.5 text-[11px] font-semibold text-warnink">
            {needCheck} NG
          </span>
        )}
      </header>

      <div className="thin-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          {head}
          <tbody>
            {rows.map((tx, i) => (
              <Row
                key={`${refs[i].sheet}-${refs[i].block}-${refs[i].row}`}
                tx={tx}
                n={i + 1}
                cols={cols}
                chk={chk[i]}
                ref_={refs[i]}
                dim={!!q && !matches(tx)}
                sel={
                  !!selected &&
                  selected.sheet === refs[i].sheet &&
                  selected.block === refs[i].block &&
                  selected.row === refs[i].row
                }
                rowIdx={rowBase + i}
                pick={pick}
                t={t}
                onEdit={onEdit}
                onDelete={onDeleteRow}
                onSelect={onSelectRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule bg-card2 px-3 py-2">
        <button
          onClick={() => onAddRow(refs[refs.length - 1])}
          className="rounded-lg border border-dashed border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accent hover:text-accent"
          title={t.addRowHint}
        >
          + {t.addRow}
        </button>
        <button
          onClick={() => onAutoBalance(refs[0].sheet, refs[0].block)}
          title={t.autoBalanceHint}
          className="rounded-lg border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accentmid hover:text-ink"
        >
          {t.autoBalance}
        </button>
        <span className="flex-1" />
        <span className="tnum text-[11.5px] text-ink3">
          {t.totalOut} <b className="text-outink">¥{yen(totalOut)}</b>
        </span>
        <span className="tnum text-[11.5px] text-ink3">
          {t.totalIn} <b className="text-inink">¥{yen(totalIn)}</b>
        </span>
        {!q && (
          <span className="tnum rounded-md bg-card3 px-2 py-0.5 text-[11.5px] text-ink2">
            {t.lastBalance} <b className="text-ink">¥{yen(lastBal ?? null)}</b>
          </span>
        )}
      </footer>
    </section>
  );
}

export default function ReviewPane({
  store,
  sheets,
  activeSheet,
  mode,
  cols,
  onToggleCol,
  onModeChange,
  onEdit,
  onDeleteRow,
  onAddRow,
  onAutoBalance,
  selected,
  onSelectRow,
}: {
  store: ResultStore;
  sheets: Sheet[];
  activeSheet: string | null;
  mode: ViewMode;
  cols: OptCols;
  onToggleCol: (k: keyof OptCols) => void;
  onModeChange: (m: ViewMode) => void;
  onEdit: EditFn;
  onDeleteRow: RowActionFn;
  onAddRow: (ref: TxRef) => void;
  onAutoBalance: (sheet: string, block: number) => void;
  /** Dòng đang chọn — khung giữa khoanh đúng dải ảnh của dòng này. */
  selected: TxRef | null;
  onSelectRow: (ref: TxRef) => void;
}) {
  const { t } = useT();
  const g = t.colGloss;
  const scroller = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  /* ── Bôi đen nhiều ô để chép sang Excel ────────────────────────────
     Kéo chuột từ ô này sang ô khác là chọn cả hình chữ nhật; Ctrl+C chép ra
     dạng ngăn bằng TAB nên dán vào Excel rơi đúng từng ô. */
  const [sel, setSel] = useState<Rect | null>(null);
  const anchor = useRef<{ r: number; c: number } | null>(null);
  const dragging = useRef(false);

  const pick = useCallback(
    (row: number, col: number) =>
      !!sel && row >= sel.r0 && row <= sel.r1 && col >= sel.c0 && col <= sel.c1,
    [sel],
  );

  const onDown = (e: React.MouseEvent) => {
    const root = scroller.current;
    if (!root) return;
    const a = cellAddr(e.target, root);
    if (!a) {
      setSel(null);
      anchor.current = null;
      return;
    }
    // Shift+bấm: nối dài từ ô neo — quen tay như Excel
    if (e.shiftKey && anchor.current) {
      setSel(norm(anchor.current, a));
      e.preventDefault();
      return;
    }
    anchor.current = a;
    dragging.current = true;
    setSel(null);           // bấm một ô là để SỬA, không phải để chọn vùng
  };

  const onOver = (e: React.MouseEvent) => {
    const root = scroller.current;
    if (!dragging.current || !anchor.current || !root) return;
    const a = cellAddr(e.target, root);
    if (!a) return;
    if (a.r === anchor.current.r && a.c === anchor.current.c) {
      setSel(null);
      return;
    }
    // Rời khỏi ô đầu = đang chọn vùng, không phải gõ chữ → bỏ con trỏ nhập
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();
    setSel(norm(anchor.current, a));
  };

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  /* Chép: bắt sự kiện `copy` của trình duyệt thay vì tự gọi clipboard API —
     không cần xin quyền, và Ctrl+C lẫn menu chuột phải đều chạy. */
  useEffect(() => {
    if (!sel) return;
    const onCopy = (e: ClipboardEvent) => {
      if (!scroller.current) return;
      e.clipboardData?.setData("text/plain", toTSV(scroller.current, sel));
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    document.addEventListener("copy", onCopy);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("copy", onCopy);
      window.removeEventListener("keydown", onKey);
    };
  }, [sel]);

  const pickedCount = sel
    ? (sel.r1 - sel.r0 + 1) * (sel.c1 - sel.c0 + 1)
    : 0;

  const sheetName = useMemo(
    () => Object.fromEntries(sheets.map((s) => [s.id, s.name])),
    [sheets],
  );

  /** Mặt sổ đã có kết quả, theo đúng thứ tự đang hiện ở cột trái. */
  const scanned = useMemo(
    () => sheets.filter((s) => store[s.id]?.blocks?.length),
    [sheets, store],
  );

  const totalRows = useMemo(
    () =>
      Object.values(store).reduce(
        (n, r) => n + r.blocks.reduce((m, b) => m + b.rows.filter((x) => !x.is_note).length, 0),
        0,
      ),
    [store],
  );

  /* Cuộn TRONG cột kết quả.
     Không scrollIntoView() — nó cuộn mọi khung cha. Không offsetTop — tính theo
     offsetParent, có thể không phải khung này. Cuộn TỨC THÌ vì bước nhảy giữa
     các mặt sổ thường vài nghìn pixel. */
  useEffect(() => {
    if (mode !== "list" || !activeSheet) return;
    const box = scroller.current;
    const target = box?.querySelector<HTMLElement>(`[data-sheet="${activeSheet}"]`);
    if (!box || !target) return;
    const delta =
      target.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop = box.scrollTop + delta;
  }, [activeSheet, mode, store]);

  const head = (
    <thead>
      <tr>
        <Th jp="行" vn="" align="center" width="34px" />
        <Th jp="年月日" vn={g.date} width="112px" />
        {cols.kind && <Th jp="区分" vn={g.kind} width="72px" />}
        <Th jp="摘要" vn={g.desc} />
        <Th jp="お支払" vn={g.out} align="right" width="106px" />
        <Th jp="お預り" vn={g.in} align="right" width="106px" />
        <Th jp="差引残高" vn={g.bal} align="right" width="118px" />
        {cols.store && <Th jp="取扱店" vn="" align="center" width="76px" />}
        {cols.extra && <Th jp="備考" vn="" align="center" width="76px" />}
        <Th jp="検算" vn="" align="center" width="38px" />
        <Th jp="確認メモ" vn="" width="140px" />
        <Th jp="" vn="" width="28px" />
      </tr>
    </thead>
  );

  /** Dòng đầu tiên của mỗi khối đứng thứ mấy trong TOÀN lưới.
   *
   * Phải khớp ĐÚNG thứ tự vẽ ra DOM, vì toạ độ hàng lúc chép lại đọc từ DOM.
   */
  const rowBase = useMemo(() => {
    const m: Record<string, number> = {};
    let n = 0;
    const order =
      mode === "page" ? (activeSheet ? [activeSheet] : []) : scanned.map((s) => s.id);
    for (const sid of order) {
      store[sid]?.blocks.forEach((b, bi) => {
        m[`${sid}:${bi}`] = n;
        n += b.rows.length;
      });
    }
    return m;
  }, [mode, activeSheet, scanned, store]);

  const cardsOf = (sheetId: string, startIndex = 0) => {
    const data = store[sheetId];
    if (!data) return null;
    const sheet = sheets.find((s) => s.id === sheetId);
    const source = sheet
      ? sheet.origin + (sheet.page ? ` · ${t.pageLabel(sheet.page)}` : "")
      : sheetId;
    return data.blocks.map((block, bi) => (
      <AccountCard
        key={`${sheetId}-${bi}`}
        meta={block.meta}
        rows={block.rows}
        refs={block.rows.map((_, ri) => ({ sheet: sheetId, block: bi, row: ri }))}
        index={startIndex + bi}
        ofTotal={data.blocks.length}
        sourceLabel={source}
        fallbackTitle={sheetName[sheetId] ?? sheetId}
        cols={cols}
        head={head}
        t={t}
        filter={filter}
        onEdit={onEdit}
        onDeleteRow={onDeleteRow}
        onAddRow={onAddRow}
        onAutoBalance={onAutoBalance}
        selected={selected}
        onSelectRow={onSelectRow}
        rowBase={rowBase[`${sheetId}:${bi}`] ?? 0}
        pick={pick}
      />
    ));
  };

  if (scanned.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-[15px] font-semibold text-ink2">{t.reviewEmpty}</p>
        <p className="max-w-xs text-[12.5px] text-ink3">{t.reviewEmptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Đầu cột */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold">
            {t.reviewTitle}
            <span className="tnum ml-1.5 font-normal text-ink3">
              ({totalRows} {t.rowsShort})
            </span>
          </p>
          <p className="text-[11px] text-ink3">{t.reviewSubtitle}</p>
        </div>

        <span className="flex-1" />

        <div className="flex overflow-hidden rounded-lg border border-rule">
          <button
            onClick={() => onModeChange("page")}
            aria-pressed={mode === "page"}
            className={`px-2.5 py-1.5 text-[12px] ${
              mode === "page"
                ? "bg-accent font-semibold text-accentink"
                : "bg-card text-ink2 hover:bg-card2"
            }`}
          >
            {t.viewCurrentPage}
          </button>
          <button
            onClick={() => onModeChange("list")}
            aria-pressed={mode === "list"}
            className={`border-l border-rule px-2.5 py-1.5 text-[12px] ${
              mode === "list"
                ? "bg-accent font-semibold text-accentink"
                : "bg-card text-ink2 hover:bg-card2"
            }`}
          >
            {t.viewAsList} ({scanned.length})
          </button>
        </div>
      </div>

      {/* Bộ lọc theo nội dung — chỉ để XEM, không ảnh hưởng file xuất */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule2 bg-card2 px-3 py-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none text-ink3" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.filterPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-rule bg-card px-2 py-1 text-[12.5px] placeholder:text-ink3"
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="rounded-md border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:text-ink"
          >
            {t.filterClear}
          </button>
        )}
        <span className="text-[10.5px] text-ink3">{t.filterNote}</span>
      </div>

      {/* Thân cột — CHÍNH khung này cuộn */}
      {/* data-grid: mốc để phím mũi tên tìm được mọi dòng, kể cả ở thẻ sổ khác */}
      <div
        ref={scroller}
        data-grid
        onMouseDown={onDown}
        onMouseOver={onOver}
        className={`thin-scroll min-h-0 flex-1 overflow-auto ${sel ? "select-none" : ""}`}
      >
        {mode === "page" ? (
          !activeSheet ? (
            <p className="p-4 text-[12.5px] text-ink3">{t.pickSheetForPage}</p>
          ) : !store[activeSheet]?.blocks?.length ? (
            <p className="p-4 text-[12.5px] text-ink3">
              {t.sheetNoResult(sheetName[activeSheet] ?? activeSheet)}
            </p>
          ) : (
            cardsOf(activeSheet)
          )
        ) : (
          <>
            {scanned.map((s, si) => (
              <section key={s.id} data-sheet={s.id}>
                <h3
                  className={`sticky top-0 z-20 flex items-center gap-2 border-y border-rule px-3 py-1.5 text-[12px] font-semibold ${
                    activeSheet === s.id ? "bg-accentpale text-ink" : "bg-card3 text-ink2"
                  }`}
                >
                  <span className="tnum text-ink3">{si + 1}.</span>
                  {s.name}
                  <span className="tnum font-normal text-ink3">
                    {store[s.id].blocks.reduce((n, b) => n + b.rows.length, 0)}{" "}
                    {t.rowsShort}
                  </span>
                </h3>
                {cardsOf(s.id)}
              </section>
            ))}
            {/* Đệm cuối: không có nó thì mặt sổ CUỐI không cuộn lên sát đầu
                khung được — cuộn kịch đáy mà phía trên vẫn lòi mặt trước. */}
            <div aria-hidden className="h-[calc(100dvh-14rem)]" />
          </>
        )}
      </div>

      {/* Chân cột: cột phụ + nhắc sửa được */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule bg-card px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wider text-ink3">
          {t.optionalCols}
        </span>
        {(
          [
            { key: "kind", label: "区分" },
            { key: "store", label: "取扱店" },
            { key: "extra", label: "備考" },
          ] as { key: keyof OptCols; label: string }[]
        ).map((c) => (
          <button
            key={c.key}
            onClick={() => onToggleCol(c.key)}
            aria-pressed={cols[c.key]}
            className={`rounded-md border px-1.5 py-0.5 text-[11.5px] transition-colors ${
              cols[c.key]
                ? "border-accent bg-accentpale text-accent"
                : "border-rule bg-card text-ink3 hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="flex-1" />
        {pickedCount > 0 ? (
          <span className="rounded-md bg-accentpale px-2 py-0.5 text-[11.5px] font-semibold text-accent">
            {t.pickedCells(pickedCount)}
          </span>
        ) : (
          <span className="text-[11px] text-ink3">{t.dragCopyHint}</span>
        )}
        <span className="text-[11px] text-ink3">{t.editableHint}</span>
      </div>
    </div>
  );
}
