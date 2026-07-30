"use client";

/**
 * Khung phải: kết quả trình bày GIỐNG MẶT SỔ THẬT, sửa được trực tiếp.
 *
 * Hai chế độ khác nhau rõ rệt:
 *   • Trang hiện tại — CHỈ mặt sổ đang xem, như cầm đúng một trang sổ trên tay.
 *   • Dạng danh sách — nối tất cả; đây là chế độ duy nhất mà click mặt sổ bên
 *     trái làm bảng cuộn tới đúng phần. Cuộn bằng `scrollTop` của CHÍNH cột này,
 *     không dùng scrollIntoView (nó kéo cả trang trôi theo).
 *
 * Tên cột giữ tiếng Nhật + chú thích tiếng Việt/Anh NGAY CẠNH (WEB_PLAN §8).
 */

import { useEffect, useMemo, useRef } from "react";
import { useT, type Dict } from "@/lib/i18n";
import type { Account, ScanPayload, Sheet, Tx } from "@/lib/api";

const yen = (v: number | null) => (v == null ? "" : v.toLocaleString("en-US"));
const parseYen = (s: string) => {
  const digits = s.replace(/[^\d-]/g, "");
  return digits === "" || digits === "-" ? null : parseInt(digits, 10);
};

export type OptCols = { store: boolean; extra: boolean; kind: boolean };
export type ViewMode = "page" | "list";
export type TxRef = { acc: number; row: number };
export type EditFn = (ref: TxRef, field: keyof Tx, value: string | number | null) => void;

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
  onEdit,
}: {
  tx: Tx;
  n: number;
  cols: OptCols;
  chk: "OK" | "NG" | "―";
  ref_: TxRef;
  onEdit: EditFn;
}) {
  const flag = tx.status === "check" || chk === "NG";
  const fixed = tx.status === "fixed";
  const note = tx.is_note;

  return (
    <tr
      className={`border-b border-rule2 ${note ? "italic text-ink3" : ""} ${
        n % 2 === 0 ? "bg-band" : ""
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
      <td className="max-w-[150px] truncate px-2 py-0.5 text-[11px]" title={tx.reason}>
        {tx.status === "check" && <span className="text-warnink">⚠ {tx.reason}</span>}
        {fixed && <span className="text-inink">✓ {tx.reason}</span>}
      </td>
    </tr>
  );
}

/** Một thẻ sổ: đầu thẻ có badge + nút, thân là bảng, chân là dòng tổng.
 *
 * ĐỊNH NGHĨA Ở MỨC MODULE, không lồng trong ReviewPane: component khai báo bên
 * trong một component khác là kiểu MỚI sau mỗi lần render, khiến React tháo và
 * dựng lại toàn bộ cây con — mất vị trí cuộn và mất focus khi đang gõ.
 */
function AccountCard({
  acc,
  accIndex,
  rows,
  index,
  fallbackTitle,
  cols,
  head,
  t,
  onEdit,
  onToggleCol,
  onAddRow,
  onAutoBalance,
}: {
  acc: Account;
  accIndex: number;
  rows: { tx: Tx; ref: TxRef }[];
  index: number;
  fallbackTitle: string;
  cols: OptCols;
  head: React.ReactNode;
  t: Dict;
  onEdit: EditFn;
  onToggleCol: (k: keyof OptCols) => void;
  onAddRow: (accIndex: number, sheetId: string | null) => void;
  onAutoBalance: (accIndex: number) => void;
}) {
  const chk = checkColumn(rows.map((r) => r.tx));
  const real = rows.filter((r) => !r.tx.is_note);
  const totalOut = real.reduce((s, r) => s + (r.tx.amount_out ?? 0), 0);
  const totalIn = real.reduce((s, r) => s + (r.tx.amount_in ?? 0), 0);
  const lastBal = [...rows].reverse().find((r) => r.tx.balance != null)?.tx.balance;
  const needCheck = chk.filter((c) => c === "NG").length;

  return (
    <section className="m-2.5 overflow-hidden rounded-xl border border-rule bg-card shadow-[var(--shadow)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-rule bg-card2 px-3 py-2">
        <span className="tnum flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent text-[11.5px] font-bold text-accentink">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold">
            {/* Không có bìa sổ thì model không biết tên ngân hàng. Ghi tên mặt
                sổ thay vì "(chưa rõ ngân hàng)" — vừa gọn vừa cho biết đang
                xem trang nào. */}
            {acc.bank_name || fallbackTitle}
            {acc.account_no && (
              <span className="ml-1.5 font-normal text-ink3">· {acc.account_no}</span>
            )}
          </p>
        </div>

        <span className="flex-1" />

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
            {rows.map((r, i) => (
              <Row
                key={`${r.ref.acc}-${r.ref.row}`}
                tx={r.tx}
                n={i + 1}
                cols={cols}
                chk={chk[i]}
                ref_={r.ref}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule bg-card2 px-3 py-2">
        <button
          onClick={() => onAddRow(accIndex, rows.at(-1)?.tx.sheet_id ?? null)}
          className="rounded-lg border border-dashed border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accent hover:text-accent"
          title={t.addRowHint}
        >
          + {t.addRow}
        </button>
        <button
          onClick={() => onAutoBalance(accIndex)}
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
        <span className="tnum rounded-md bg-card3 px-2 py-0.5 text-[11.5px] text-ink2">
          {t.lastBalance} <b className="text-ink">¥{yen(lastBal ?? null)}</b>
        </span>
      </footer>
    </section>
  );
}

export default function ReviewPane({
  result,
  sheets,
  activeSheet,
  mode,
  cols,
  onToggleCol,
  onModeChange,
  onEdit,
  onAddRow,
  onAutoBalance,
}: {
  result: ScanPayload | null;
  sheets: Sheet[];
  activeSheet: string | null;
  mode: ViewMode;
  cols: OptCols;
  onToggleCol: (k: keyof OptCols) => void;
  onModeChange: (m: ViewMode) => void;
  onEdit: EditFn;
  onAddRow: (accIndex: number, sheetId: string | null) => void;
  onAutoBalance: (accIndex: number) => void;
}) {
  const { t } = useT();
  const g = t.colGloss;
  const scroller = useRef<HTMLDivElement>(null);

  const sheetName = useMemo(
    () => Object.fromEntries(sheets.map((s) => [s.id, s.name])),
    [sheets],
  );

  /** Các khối dòng của MỘT mặt sổ, kèm vị trí gốc để sửa đúng ô. */
  const blocksOf = (sid: string) => {
    if (!result) return [];
    const out: { acc: Account; accIndex: number; rows: { tx: Tx; ref: TxRef }[] }[] = [];
    result.accounts.forEach((acc, ai) => {
      acc.transactions.forEach((tx, ri) => {
        if (tx.sheet_id !== sid) return;
        const last = out.at(-1);
        if (last && last.acc === acc) last.rows.push({ tx, ref: { acc: ai, row: ri } });
        else out.push({ acc, accIndex: ai, rows: [{ tx, ref: { acc: ai, row: ri } }] });
      });
    });
    return out;
  };

  /* Cuộn TRONG cột kết quả, không kéo cả trang.
     Không dùng scrollIntoView() — nó cuộn MỌI khung cha cuộn được.
     Không dùng offsetTop — nó tính theo offsetParent, có thể không phải khung
     này. Chênh lệch getBoundingClientRect + scrollTop hiện tại là cách chắc
     chắn đúng trong mọi bố cục. */
  useEffect(() => {
    if (mode !== "list" || !activeSheet) return;
    const box = scroller.current;
    const target = box?.querySelector<HTMLElement>(`[data-sheet="${activeSheet}"]`);
    if (!box || !target) return;
    const delta =
      target.getBoundingClientRect().top - box.getBoundingClientRect().top;
    // Cuộn TỨC THÌ, không "smooth": bước nhảy giữa các mặt sổ thường vài nghìn
    // pixel — cuộn mượt qua chừng đó vừa lâu vừa làm hoa mắt, và trong một số
    // môi trường (ẩn tab, prefers-reduced-motion) nó bị bỏ qua hoàn toàn.
    box.scrollTop = box.scrollTop + delta;
  }, [activeSheet, mode, result]);

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-[15px] font-semibold text-ink2">{t.reviewEmpty}</p>
        <p className="max-w-xs text-[12.5px] text-ink3">{t.reviewEmptyHint}</p>
      </div>
    );
  }

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
        <Th jp="確認メモ" vn="" width="150px" />
      </tr>
    </thead>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Đầu cột */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold">
            {t.reviewTitle}
            <span className="tnum ml-1.5 font-normal text-ink3">
              ({result.totals.rows} {t.rowsShort})
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
            {t.viewAsList} ({result.sheet_ids.length})
          </button>
        </div>
      </div>

      {/* Thân cột — CHÍNH khung này cuộn, không phải cả trang */}
      <div ref={scroller} className="thin-scroll min-h-0 flex-1 overflow-auto">
        {mode === "page" ? (
          (() => {
            if (!activeSheet) {
              return <p className="p-4 text-[12.5px] text-ink3">{t.pickSheetForPage}</p>;
            }
            const blocks = blocksOf(activeSheet);
            if (blocks.length === 0) {
              return (
                <p className="p-4 text-[12.5px] text-ink3">
                  {t.sheetNoResult(sheetName[activeSheet] ?? activeSheet)}
                </p>
              );
            }
            return blocks.map((b, bi) => (
              <AccountCard
                key={bi}
                acc={b.acc}
                accIndex={b.accIndex}
                rows={b.rows}
                index={bi}
                fallbackTitle={sheetName[activeSheet] ?? activeSheet}
                cols={cols}
                head={head}
                t={t}
                onEdit={onEdit}
                onToggleCol={onToggleCol}
                onAddRow={onAddRow}
                onAutoBalance={onAutoBalance}
              />
            ));
          })()
        ) : (
          result.sheet_ids.map((sid, si) => {
            const blocks = blocksOf(sid);
            return (
              <section key={sid} data-sheet={sid} className="scroll-mt-0">
                <h3
                  className={`sticky top-0 z-20 flex items-center gap-2 border-y border-rule px-3 py-1.5 text-[12px] font-semibold ${
                    activeSheet === sid
                      ? "bg-accentpale text-ink"
                      : "bg-card3 text-ink2"
                  }`}
                >
                  <span className="tnum text-ink3">{si + 1}.</span>
                  {sheetName[sid] ?? sid}
                  <span className="tnum font-normal text-ink3">
                    {blocks.reduce((n, b) => n + b.rows.length, 0)} {t.rowsShort}
                  </span>
                </h3>
                {blocks.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-ink3">{t.stNoRows}</p>
                ) : (
                  blocks.map((b, bi) => (
                    <AccountCard
                      key={bi}
                      acc={b.acc}
                      accIndex={b.accIndex}
                      rows={b.rows}
                      index={bi}
                      fallbackTitle={sheetName[sid] ?? sid}
                      cols={cols}
                      head={head}
                      t={t}
                      onEdit={onEdit}
                      onToggleCol={onToggleCol}
                      onAddRow={onAddRow}
                      onAutoBalance={onAutoBalance}
                    />
                  ))
                )}
              </section>
            );
          })
        )}
        {/* Đệm cuối: không có nó thì mặt sổ CUỐI không thể cuộn lên sát đầu
            khung — cuộn kịch đáy mà tiêu đề mặt cuối vẫn nằm giữa màn hình,
            phía trên còn lòi phần của mặt trước. */}
        {mode === "list" && <div aria-hidden className="h-[calc(100dvh-14rem)]" />}
      </div>

      {/* Chân cột: nhắc giới hạn + tuỳ chọn cột phụ */}
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
