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

import { useEffect, useMemo, useRef, useState } from "react";
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

/** Ô sửa được — trông như chữ thường cho tới khi bấm vào. */
function Cell({
  value,
  align = "left",
  money = false,
  tone,
  placeholder,
  onCommit,
}: {
  value: string;
  align?: "left" | "right";
  money?: boolean;
  tone?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => {
        const el = e.target as HTMLInputElement;
        if (e.key === "Enter") el.blur();
        if (e.key === "Escape") {
          el.value = value;
          el.blur();
        }
      }}
      inputMode={money ? "numeric" : undefined}
      className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 placeholder:text-ink3/60 hover:border-rule focus:border-accent focus:bg-card focus:outline-none ${
        align === "right" ? "text-right" : ""
      } ${money ? "tnum" : ""} ${tone ?? ""}`}
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
  t: Dict;
  onEdit: EditFn;
  onDelete: RowActionFn;
  onSelect: RowActionFn;
}) {
  const flag = tx.status === "check" || chk === "NG";
  const fixed = tx.status === "fixed";
  const note = tx.is_note;

  return (
    <tr
      data-row={`${ref_.sheet}:${ref_.block}:${ref_.row}`}
      onClick={() => onSelect(ref_)}
      className={`group cursor-default border-b border-rule2 ${
        note ? "italic text-ink3" : ""
      } ${n % 2 === 0 ? "bg-band" : ""} ${dim ? "opacity-25" : ""} ${
        sel ? "outline outline-2 -outline-offset-2 outline-danger" : ""
      } hover:bg-accentpale/30`}
    >
      <td className="tnum w-8 border-r border-rule2 bg-card2 px-1 text-center text-[10.5px] text-ink3">
        {tx.row_no || String(n).padStart(2, "0")}
      </td>
      <td className="whitespace-nowrap px-1 py-0.5">
        <Cell
          value={tx.date ?? tx.date_raw ?? ""}
          onCommit={(v) => onEdit(ref_, "date", v || null)}
        />
      </td>
      {cols.kind && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[12.5px]">
          <Cell value={tx.kind ?? ""} onCommit={(v) => onEdit(ref_, "kind", v || null)} />
        </td>
      )}
      <td className={`px-1 py-0.5 ${flag ? "bg-warnbg" : ""}`}>
        <Cell
          value={tx.description ?? ""}
          tone={flag ? "text-warnink" : ""}
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
          onCommit={(v) => onEdit(ref_, "balance", parseYen(v))}
        />
      </td>
      {cols.store && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[11.5px] text-ink2">
          <Cell
            value={tx.store_code ?? ""}
            onCommit={(v) => onEdit(ref_, "store_code", v || null)}
          />
        </td>
      )}
      {cols.extra && (
        <td className="whitespace-nowrap px-1 py-0.5 text-[11.5px] text-ink2">
          <Cell
            value={tx.extra_text ?? ""}
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
  fallbackTitle,
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
}: {
  meta: AccountMeta;
  rows: Tx[];
  refs: TxRef[];
  index: number;
  fallbackTitle: string;
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
        <span className="tnum flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent text-[11.5px] font-bold text-accentink">
          {index + 1}
        </span>
        <p className="min-w-0 truncate text-[13.5px] font-bold">
          {/* Không có bìa sổ thì model không biết tên ngân hàng. Ghi tên mặt sổ
              thay vì "(chưa rõ ngân hàng)" — vừa gọn vừa cho biết đang xem gì. */}
          {meta.bank_name || fallbackTitle}
          {meta.account_no && (
            <span className="ml-1.5 font-normal text-ink3">· {meta.account_no}</span>
          )}
        </p>
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

  const cardsOf = (sheetId: string, startIndex = 0) => {
    const data = store[sheetId];
    if (!data) return null;
    return data.blocks.map((block, bi) => (
      <AccountCard
        key={`${sheetId}-${bi}`}
        meta={block.meta}
        rows={block.rows}
        refs={block.rows.map((_, ri) => ({ sheet: sheetId, block: bi, row: ri }))}
        index={startIndex + bi}
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
      <div ref={scroller} className="thin-scroll min-h-0 flex-1 overflow-auto">
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
        <span className="text-[11px] text-ink3">{t.editableHint}</span>
      </div>
    </div>
  );
}
