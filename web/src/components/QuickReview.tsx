"use client";

/**
 * Chế độ «Soát nhanh» (task 3.2): thay cả cột kết quả bằng MỘT thẻ lớn cho MỘT dòng cần soát, đi lần lượt qua mọi
 * mặt sổ theo thứ tự cột trái. Lời hứa của sản phẩm: máy đọc nhanh, chỉ ra đúng những dòng đáng ngờ, người sửa
 * trong 30 giây — không phải dò cả bảng.
 *
 * Danh sách dòng và «dòng nào là kế tiếp» do `lib/quickreview.ts` (thuần, có test) quyết; ở đây chỉ giữ phiên
 * (dòng hiện tại, dòng đã từng thấy để đếm tiến độ) và vẽ. «Cần soát» vẫn là định nghĩa chung của `review.ts`.
 *
 * Dòng hiện tại được nhớ bằng `rid` chứ không bằng chỉ số: sửa dòng, chèn dòng sót hay xoá dòng không làm thẻ
 * nhảy sang dòng khác. Dòng vừa hết cần soát (✓ hoặc sửa đúng) thì tự sang dòng kế.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import FixChips from "@/components/FixChips";
import RowStrip from "@/components/RowStrip";
import type { EditField, ResultStore, RowBands, Sheet, Tx } from "@/lib/api";
import type { DictField } from "@/lib/corrections";
import { useCorrections } from "@/lib/corrections-provider";
import { useT, type Dict } from "@/lib/i18n";
import {
  calcOf,
  chainBreaks,
  flattenRows,
  pendingOf,
  progress,
  resolveCurrent,
  sheetRowIndex,
  stepFrom,
  type Calc,
  type QRow,
  type RowRef,
} from "@/lib/quickreview";
import {
  analyzeRows,
  balanceBefore,
  explainOpen,
  parseYen,
  suggestFixes,
  type Fix,
  type FocusField,
} from "@/lib/review";

const yen = (v: number | null) => (v == null ? "" : v.toLocaleString("en-US"));

/** «Số dư trước ¥P − rút ¥O + gửi ¥I = ¥E · sổ in ¥B, chênh ¥diff» (hoặc «— khớp», hoặc «sổ không in số dư»). */
function calcText(t: Dict, c: Calc): string {
  const tail =
    c.printed == null
      ? t.qrCalcNoBal
      : c.diff === 0
        ? `${t.qrCalcPrinted(c.printed)} — ${t.qrCalcMatch}`
        : `${t.qrCalcPrinted(c.printed)}, ${t.qrCalcOff(c.diff as number)}`;
  return `${t.qrCalc(c.before, c.out, c.inn)} ${t.qrCalcEq(c.expected)} · ${tail}`;
}

/** Một ô của thẻ: chữ to, ghi nhận khi rời ô / Enter, Esc trả về giá trị cũ (cùng cách với ô của bảng). */
function QField({
  label,
  gloss,
  value,
  field,
  money = false,
  flagged = false,
  span,
  invalidHint,
  extra,
  onCommit,
}: {
  label: string;
  gloss: string;
  value: string;
  field: EditField;
  money?: boolean;
  /** Ô gây lệch — viền vàng cho mắt tìm ra ngay. */
  flagged?: boolean;
  span: string;
  invalidHint?: string;
  /** Nội dung phụ dưới ô (vd nút gợi ý của từ điển). */
  extra?: ReactNode;
  /** Trả `false` = từ chối giá trị (ô quay về giá trị cũ). */
  onCommit: (v: string) => void | boolean;
}) {
  // Sau MỖI lần ghi nhận phải dựng lại ô: ô không kiểm soát (`defaultValue`) nên nếu giá trị chuẩn hoá trùng chữ
  // đang hiện thì React không vẽ lại và ô giữ nguyên chữ vừa gõ (xem `Cell` ở ReviewPane).
  const [rev, setRev] = useState(0);
  return (
    <label className={`flex flex-col gap-0.5 ${span}`}>
      <span className="text-[12px] text-ink3">
        <span className="font-semibold text-ink2">{label}</span> {gloss}
      </span>
      <input
        key={`${value}|${rev}`}
        data-qf={field}
        data-flagged={flagged ? "1" : undefined}
        defaultValue={value}
        inputMode={money ? "numeric" : undefined}
        onBlur={(e) => {
          const el = e.target;
          if (el.value === value) return;
          if (onCommit(el.value) === false) {
            el.value = value;
            el.dataset.invalid = "1";
            el.title = invalidHint ?? "";
            setTimeout(() => {
              delete el.dataset.invalid;
              el.title = "";
            }, 2500);
          } else {
            setRev((r) => r + 1);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.currentTarget.value = value;
            e.currentTarget.blur();
            e.stopPropagation();                      // Esc chỉ rời khỏi ô; Esc kế tiếp mới thoát chế độ
          }
        }}
        className={`w-full rounded-lg border bg-card px-2.5 py-1.5 text-[18px] focus:border-accent focus:outline-none data-[invalid]:border-danger data-[invalid]:bg-danger/10 ${
          flagged ? "border-warnedge bg-warnbg" : "border-rule"
        } ${money ? "tnum text-right" : ""}`}
      />
      {extra}
    </label>
  );
}

export default function QuickReview({
  wsId,
  sheets,
  store,
  bands,
  bandsSheet,
  bandsState,
  onActivate,
  onEdit,
  onFix,
  onAcceptSug,
  onConfirm,
  onExport,
  onClose,
}: {
  wsId: string;
  sheets: Sheet[];
  store: ResultStore;
  /** Dải ảnh của mặt sổ ĐANG XEM (`active`) — khi dòng hiện tại ở mặt khác thì chờ `onActivate` đổi mặt. */
  bands: RowBands | null;
  /** Mặt sổ mà `bands` thuộc về. Khác mặt của dòng hiện tại (vừa chuyển mặt, dải mới chưa về) thì chưa được dùng. */
  bandsSheet: string | null;
  bandsState: "loading" | "unavailable" | "ready";
  /** Dòng hiện tại sang mặt sổ khác: đặt mặt đó làm mặt đang xem (ảnh ở giữa đổi theo). */
  onActivate: (sheetId: string) => void;
  onEdit: (ref: RowRef, field: EditField, value: string | number | null) => void;
  onFix: (ref: RowRef, fix: Fix) => void;
  /** Nhận gợi ý của từ điển sửa lỗi cho một ô của dòng hiện tại (task 3.3). */
  onAcceptSug: (ref: RowRef, field: DictField, right: string) => void;
  /** Bấm ✓ «Đúng rồi»: người đã nhìn dòng này và chấp nhận (cùng việc với nút ✓ ở bảng). */
  onConfirm: (ref: RowRef) => void;
  /** Soát xong: sang hộp Xuất file. */
  onExport: () => void;
  /** Thoát. `ref` = dòng đang xem (null nếu đã xong) để bảng nhảy về đúng dòng đó. */
  onClose: (ref: RowRef | null, field: FocusField | null) => void;
}) {
  const { t, lang } = useT();
  const { suggest } = useCorrections();
  const order = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const rows = useMemo(() => flattenRows(order, store), [order, store]);
  const pending = useMemo(() => pendingOf(rows), [rows]);

  const [cur, setCur] = useState<string | null>(null);
  const lastIdx = useRef(0);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());

  const here = resolveCurrent(rows, cur, lastIdx.current);
  const row: QRow | null = here.row;

  // Ghi nhớ mọi dòng từng cần soát trong phiên (mẫu số của «Dòng k/N»)
  const pendingKeys = pending.map((r) => r.key).join("\n");
  useEffect(() => {
    setSeen((prev) => {
      const add = pending.filter((r) => !prev.has(r.key));
      if (add.length === 0) return prev;
      const next = new Set(prev);
      add.forEach((r) => next.add(r.key));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKeys]);

  // Đồng bộ dòng hiện tại + vị trí của nó; sang mặt sổ khác thì đặt mặt đó làm mặt đang xem
  const rowKey = row?.key ?? null;
  const rowSheet = row?.ref.sheet ?? null;
  useEffect(() => {
    if (here.idx >= 0) lastIdx.current = here.idx;
    if (rowKey !== cur) setCur(rowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey, here.idx]);
  useEffect(() => {
    if (rowSheet) onActivate(rowSheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSheet]);

  const go = (dir: 1 | -1) => {
    if (here.idx < 0) return;
    const next = stepFrom(rows, here.idx, dir);
    if (next) setCur(next.key);
  };
  const close = () => onClose(row ? row.ref : null, row ? row.field : null);
  const confirm = () => {
    if (row) onConfirm(row.ref);                // dòng hết «cần soát» ⇒ thẻ tự sang dòng kế (resolveCurrent)
  };

  // Phím: Ctrl+Enter = ✓ rồi sang dòng kế (cả khi đang gõ dở — ô được ghi nhận trước), Enter (không đang gõ) cũng vậy,
  // n = bỏ qua, p = quay lại, Esc = thoát. Gõ trong ô thì n/p là chữ, không phải phím lệnh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if (e.key === "Escape") {
        if (typing) {
          (el as HTMLElement).blur();               // Esc đầu tiên chỉ rời khỏi ô; Esc tiếp theo mới thoát
          return;
        }
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (typing) (el as HTMLElement).blur();       // ghi nốt chữ đang gõ dở trước đã
        confirm();
        return;
      }
      if (e.key === "Enter" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && el?.tagName !== "BUTTON") {
        e.preventDefault();
        confirm();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        go(1);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const prog = progress(seen, pending, rowKey);
  const breaks = chainBreaks(rows);
  const sheet = row ? sheets.find((s) => s.id === row.ref.sheet) : undefined;
  const block = row ? store[row.ref.sheet]?.blocks[row.ref.block] : undefined;
  const tx: Tx | undefined = row && block ? block.rows[row.ref.row] : undefined;

  // Mọi thứ phụ thuộc dòng hiện tại: tính đúng MỘT lượt từ định nghĩa chung của review.ts
  const detail = useMemo(() => {
    if (!row || !block || !tx) return null;
    const info = analyzeRows(block.rows)[row.ref.row];
    return {
      explain: explainOpen(tx, info, lang),
      fixes: suggestFixes(block.rows, row.ref.row),
      calc: calcOf(tx, balanceBefore(block.rows)[row.ref.row]),
    };
  }, [row, block, tx, lang]);

  const g = t.colGloss;
  const ref = row?.ref;
  const flaggedField = row?.field;
  const num = (field: EditField) => (v: string) => {
    const r = parseYen(v);
    if (!r.ok) return false;
    if (ref) onEdit(ref, field, r.value);
  };
  const text = (field: EditField) => (v: string) => {
    if (ref) onEdit(ref, field, v || null);
  };
  /** Nút «💡 đáp án» của từ điển dưới ô chữ. */
  const sugChip = (field: DictField, current: string | null) => {
    const right = ref && !tx?.is_note ? suggest(field, current) : null;
    if (!right || !ref) return null;
    return (
      <button
        type="button"
        data-sug={field}
        title={t.dictSuggestTitle(right)}
        onClick={() => onAcceptSug(ref, field, right)}
        className="self-start rounded-lg border border-accent/50 bg-accentpale px-2.5 py-1 text-[14px] font-semibold text-accent hover:bg-accent hover:text-accentink"
      >
        💡 {right}
      </button>
    );
  };

  return (
    <div data-testid="quick-review" className="flex h-full min-h-0 flex-col bg-page">
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-card px-4 py-2.5">
        <span className="rounded-md bg-accent px-2 py-0.5 text-[12px] font-bold text-accentink">▶ {t.qrTitle}</span>
        {row && sheet ? (
          <span data-testid="quick-progress" className="tnum text-[13.5px] font-semibold">
            {t.qrProgress(prog.k, prog.n, sheet.name)}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          data-testid="quick-exit"
          onClick={close}
          className="rounded-lg border border-rule px-3 py-1.5 text-[13px] text-ink2 hover:border-accentmid hover:text-ink"
        >
          {t.qrExit}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {row && tx && sheet && detail && ref ? (
          <div data-testid="quick-card" data-row-key={row.key} className="mx-auto flex max-w-3xl flex-col gap-3">
            <RowStrip
              wsId={wsId}
              sheet={sheet}
              bands={bandsSheet === ref.sheet ? bands : null}
              bandsState={bandsSheet === ref.sheet ? bandsState : "loading"}
              index={sheetRowIndex(store, ref)}
              stale={!sheet.scanned}
            />

            {detail.explain.length > 0 && (
              <p data-testid="quick-explain" className="text-[14.5px] font-medium text-warnink">
                ⚠ {detail.explain.join(" · ")}
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-6">
              <QField label="年月日" gloss={g.date} value={tx.date ?? tx.date_raw ?? ""} field="date" span="sm:col-span-2"
                flagged={flaggedField === "date"} onCommit={text("date")} />
              <QField label="区分" gloss={g.kind} value={tx.kind ?? ""} field="kind" span="sm:col-span-1" onCommit={text("kind")}
                extra={sugChip("kind", tx.kind)} />
              <QField label="摘要" gloss={g.desc} value={tx.description ?? ""} field="description" span="col-span-2 sm:col-span-3"
                flagged={flaggedField === "description"} onCommit={text("description")} extra={sugChip("description", tx.description)} />
              <QField label="出金" gloss={g.out} value={yen(tx.amount_out)} field="amount_out" money span="sm:col-span-2"
                invalidHint={t.cellNumberOnly} onCommit={num("amount_out")} />
              <QField label="入金" gloss={g.in} value={yen(tx.amount_in)} field="amount_in" money span="sm:col-span-2"
                invalidHint={t.cellNumberOnly} onCommit={num("amount_in")} />
              <QField label="残高" gloss={g.bal} value={yen(tx.balance)} field="balance" money span="col-span-2 sm:col-span-2"
                flagged={flaggedField === "balance"} invalidHint={t.cellNumberOnly} onCommit={num("balance")} />
            </div>

            {detail.calc && (
              <p
                data-testid="quick-calc"
                data-diff={detail.calc.diff ?? ""}
                className={`tnum rounded-lg border px-3 py-2 text-[15px] ${
                  detail.calc.diff === 0 ? "border-okedge bg-okbg text-okink" : "border-warnedge bg-warnbg text-warnink"
                }`}
              >
                {calcText(t, detail.calc)}
              </p>
            )}

            <FixChips fixes={detail.fixes} onApply={(fix) => onFix(ref, fix)} />

          </div>
        ) : seen.size > 0 ? (
          <div data-testid="quick-done" className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-okedge bg-okbg p-5 text-okink">
            <h2 className="text-[20px] font-bold">✓ {t.qrDoneTitle}</h2>
            <p className="tnum text-[15px]">{t.qrDoneCount(seen.size)}</p>
            {breaks === 0 ? (
              <>
                <p className="text-[16px] font-semibold">残高チェーン検証済</p>
                <p className="text-[14.5px] leading-relaxed">{t.qrDoneChainOk}</p>
              </>
            ) : (
              <p data-testid="quick-done-breaks" className="text-[14.5px] leading-relaxed text-warnink">
                {t.qrDoneBreaks(breaks)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                data-testid="quick-export"
                onClick={onExport}
                className="rounded-lg border border-accent bg-accent px-5 py-2.5 text-[15px] font-semibold text-accentink hover:brightness-110"
              >
                {t.exportBtn}
              </button>
              <button
                data-testid="quick-back"
                onClick={close}
                className="rounded-lg border border-rule bg-card px-4 py-2.5 text-[14px] text-ink2 hover:border-accentmid hover:text-ink"
              >
                {t.qrBackToTable}
              </button>
            </div>
          </div>
        ) : (
          <p data-testid="quick-empty" className="mx-auto max-w-3xl rounded-xl border border-rule bg-card p-4 text-[15px]">
            {t.qrNothing}
          </p>
        )}
      </div>

      {/* Thanh nút CỐ ĐỊNH ở chân: thẻ dài (3 đoạn ảnh + 6 ô) cuộn được, nhưng nút «Đúng rồi» luôn nằm trong tầm mắt */}
      {row && (
        <div className="flex flex-none flex-wrap items-center gap-2 border-t border-rule bg-card px-4 py-2.5">
          <button
            data-testid="quick-prev"
            onClick={() => go(-1)}
            disabled={pending.length < 2}
            className="rounded-lg border border-rule px-3.5 py-2 text-[14px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-40"
          >
            ← {t.qrPrev}
          </button>
          <button
            data-testid="quick-skip"
            onClick={() => go(1)}
            disabled={pending.length < 2}
            className="rounded-lg border border-rule px-3.5 py-2 text-[14px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-40"
          >
            {t.qrSkip} →
          </button>
          <span className="flex-1" />
          <button
            data-testid="quick-confirm"
            onClick={confirm}
            className="rounded-lg border border-okink bg-okink px-5 py-2 text-[15px] font-semibold text-white hover:brightness-110"
          >
            ✓ {t.qrConfirm}
          </button>
        </div>
      )}
    </div>
  );
}
