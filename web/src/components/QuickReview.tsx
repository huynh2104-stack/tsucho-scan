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
 *
 * Đổi dòng là đổi NGAY về dữ liệu (phím nhấn liên tiếp không phải chờ gì); chuyển động chỉ là phần nhìn. Thẻ cũ còn lại
 * trên màn hình lúc trượt đi chỉ là hình: nó bỏ hết các mốc (`data-testid`, `data-qf`…) và không bấm được, nên ở mọi thời
 * điểm chỉ có đúng một thẻ thật.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";

import FixChips from "@/components/FixChips";
import RowStrip from "@/components/RowStrip";
import Seal from "@/components/ui/Seal";
import { ArrowLeft, ArrowRight, Lightbulb, LinkBreak, Stamp, Warning } from "@/components/ui/icons";
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

/** «Số dư trước ¥P − rút ¥O + gửi ¥I = ¥E · sổ in ¥B, chênh ¥diff» (hoặc «· khớp», hoặc «sổ không in số dư»). */
function calcText(t: Dict, c: Calc): string {
  const tail =
    c.printed == null
      ? t.qrCalcNoBal
      : c.diff === 0
        ? `${t.qrCalcPrinted(c.printed)} · ${t.qrCalcMatch}`
        : `${t.qrCalcPrinted(c.printed)}, ${t.qrCalcOff(c.diff as number)}`;
  return `${t.qrCalc(c.before, c.out, c.inn)} ${t.qrCalcEq(c.expected)} · ${tail}`;
}

/** 「終了（Esc）」→ chữ và phím, để phím hiện bằng `kbd` thay vì nằm trong ngoặc. */
function splitKey(label: string): [string, string | null] {
  const m = label.match(/^(.*?)\s*[(（]([^()（）]+)[)）]$/);
  return m ? [m[1], m[2]] : [label, null];
}

/** Dòng vừa được đóng dấu. Đặt NGOÀI AnimatePresence vì thẻ đang trượt đi giữ nguyên prop cũ, chỉ context mới tới được nó. */
const SealedRow = createContext<string | null>(null);

/** Con dấu ấn xong, dừng một nhịp cho mắt thấy, rồi mới lật sang dòng kế. Dữ liệu đã đổi từ trước đó rồi. */
const HOLD_S = 0.2;
const SLIDE_S = 0.18;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type Turn = { dir: 1 | -1; sealed: boolean; still: boolean };

const SLIDE: Variants = {
  enter: (c: Turn) => (c.still ? { opacity: 1, x: 0 } : { opacity: 0, x: c.dir * 20 }),
  center: (c: Turn) => ({
    opacity: 1,
    x: 0,
    transition: c.still ? { duration: 0 } : { duration: SLIDE_S, ease: EASE_OUT, delay: c.sealed ? HOLD_S : 0 },
  }),
  exit: (c: Turn) => ({
    opacity: 0,
    x: c.still ? 0 : c.dir * -20,
    transition: c.still ? { duration: 0 } : { duration: SLIDE_S, ease: EASE_OUT, delay: c.sealed ? HOLD_S : 0 },
  }),
};

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
  live,
  onCommit,
}: {
  label: string;
  gloss: string;
  value: string;
  field: EditField;
  money?: boolean;
  /** Ô gây lệch — nền vàng cho mắt tìm ra ngay. */
  flagged?: boolean;
  span: string;
  invalidHint?: string;
  /** Nội dung phụ dưới ô (vd nút gợi ý của từ điển). */
  extra?: ReactNode;
  live: boolean;
  /** Trả `false` = từ chối giá trị (ô quay về giá trị cũ). */
  onCommit: (v: string) => void | boolean;
}) {
  // Sau MỖI lần ghi nhận phải dựng lại ô: ô không kiểm soát (`defaultValue`) nên nếu giá trị chuẩn hoá trùng chữ
  // đang hiện thì React không vẽ lại và ô giữ nguyên chữ vừa gõ (xem `Cell` ở ReviewPane).
  const [rev, setRev] = useState(0);
  return (
    <label className={`flex min-w-0 flex-col gap-1 [@media(max-height:820px)]:gap-0.5 ${span}`}>
      <span className="truncate text-t12 text-ink3">
        <span className="font-bold text-ink2">{label}</span> {gloss}
      </span>
      <input
        key={`${value}|${rev}`}
        data-qf={live ? field : undefined}
        data-flagged={live && flagged ? "1" : undefined}
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
        className={`field num min-h-[calc(40px*var(--fs))] text-t16 [@media(max-height:820px)]:min-h-[calc(32px*var(--fs))] [@media(max-height:820px)]:text-t14 data-[invalid]:border-danger data-[invalid]:bg-shupale ${
          flagged ? "border-warnedge bg-warnbg text-warnink" : ""
        } ${money ? "text-right" : ""}`}
      />
      {extra}
    </label>
  );
}

/** Một dòng của phép tính: dấu, tên, số. Ba cột chung một lưới nên hàng đơn vị của mọi số nằm thẳng nhau. */
function ArithLine({
  op,
  label,
  gloss,
  value,
  tone = "text-ink",
  big = false,
  bold = false,
}: {
  op?: string;
  label: string;
  gloss?: string;
  value: string;
  tone?: string;
  big?: boolean;
  bold?: boolean;
}) {
  return (
    <>
      <span className={`num self-baseline text-t22 leading-tight [@media(max-height:820px)]:text-t18 ${tone}`}>{op}</span>
      <span className={`min-w-0 self-baseline truncate text-t14 ${bold ? "font-bold text-ink" : "text-ink2"}`}>
        {label}
        {gloss && <span className="ml-1.5 text-t12 text-ink3">{gloss}</span>}
      </span>
      <span className={`num self-baseline text-right leading-tight ${big ? "text-t28 font-bold [@media(max-height:820px)]:text-t22" : "text-t22 [@media(max-height:820px)]:text-t18"} ${bold ? "font-bold" : ""} ${tone}`}>
        {value}
      </span>
    </>
  );
}

/** Phép tính đặt như tính tay trên giấy: đọc được từ khoảng cách một sải tay. Câu văn cùng nội dung nằm ở `quick-calc`. */
function Arith({ c, t }: { c: Calc; t: Dict }) {
  const g = t.colGloss;
  const off = c.diff != null && c.diff !== 0;
  return (
    <div aria-hidden data-testid="quick-arith" className="grid grid-cols-[1.1em_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5">
      <ArithLine label={t.qrLblBefore} value={yen(c.before)} />
      <ArithLine op="−" label={t.colOut} gloss={g.out} value={yen(c.out)} tone={c.out ? "text-outink" : "text-ink3"} />
      <ArithLine op="+" label={t.colIn} gloss={g.in} value={yen(c.inn)} tone={c.inn ? "text-inink" : "text-ink3"} />
      <span className="col-span-full my-0.5 h-px bg-ink3" />
      <ArithLine op="=" label={t.qrLblExpected} value={yen(c.expected)} bold />
      <ArithLine label={t.qrLblPrinted} value={c.printed == null ? t.qrCalcNoBal : yen(c.printed)} />
      {c.diff != null && (
        <>
          <span className="col-span-full my-0.5 h-[3px] border-y border-ink3" />
          <ArithLine
            label={t.qrLblDiff}
            value={c.diff === 0 ? t.qrCalcMatch : `${c.diff > 0 ? "+" : "−"}${yen(Math.abs(c.diff))}`}
            tone={off ? "text-shu" : "text-okink"}
            big={off}
            bold
          />
        </>
      )}
    </div>
  );
}

/** Thẻ của một dòng. Tách thành component vì nó phải tự biết mình đang ở lại hay đang trượt đi (`useIsPresent`). */
function RowCard({
  rowKey,
  wsId,
  sheet,
  bands,
  bandsState,
  stripIndex,
  tx,
  flagged,
  explain,
  fixes,
  calc,
  sugKind,
  sugDesc,
  t,
  text,
  num,
  onSug,
  onFix,
}: {
  rowKey: string;
  wsId: string;
  sheet: Sheet;
  bands: RowBands | null;
  bandsState: "loading" | "unavailable" | "ready";
  stripIndex: number;
  tx: Tx;
  flagged: FocusField;
  explain: string[];
  fixes: Fix[];
  calc: Calc | null;
  sugKind: string | null;
  sugDesc: string | null;
  t: Dict;
  text: (field: EditField) => (v: string) => void;
  num: (field: EditField) => (v: string) => void | boolean;
  onSug: (field: DictField, right: string) => void;
  onFix: (fix: Fix) => void;
}) {
  const live = useIsPresent();
  const sealed = useContext(SealedRow) === rowKey && !live;
  const g = t.colGloss;
  /** Nút «đáp án» của từ điển dưới ô chữ. */
  const sugChip = (field: DictField, right: string | null) =>
    right ? (
      <button
        type="button"
        data-sug={live ? field : undefined}
        title={t.dictSuggestTitle(right)}
        onClick={() => onSug(field, right)}
        className="btn btn-quiet btn-sm self-start"
      >
        <Lightbulb size={14} className="text-accent" />
        {right}
      </button>
    ) : undefined;

  return (
    <div
      data-testid={live ? "quick-card" : undefined}
      data-row-key={live ? rowKey : undefined}
      inert={!live}
      className="mx-auto flex w-full max-w-[880px] flex-col gap-4 [@media(max-height:820px)]:gap-2"
    >
      <RowStrip wsId={wsId} sheet={sheet} bands={bands} bandsState={bandsState} index={stripIndex} stale={!sheet.scanned} live={live} />

      <div className={`grid gap-x-8 gap-y-3 [@media(max-height:820px)]:gap-y-1.5 ${calc ? "@min-[620px]:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)]" : ""}`}>
        {calc && (
          <div className="relative min-w-0">
            {/* Bản câu văn của phép tính cho trình đọc màn hình; mắt nhìn đọc lưới số bên dưới */}
            <p data-testid={live ? "quick-calc" : undefined} data-diff={calc.diff ?? ""} className="sr-only">
              {calcText(t, calc)}
            </p>
            <Arith c={calc} t={t} />
            {sealed && <Seal size={84} press className="pointer-events-none absolute left-[38%] top-[34%]" />}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-3">
          {explain.length > 0 && (
            <p data-testid={live ? "quick-explain" : undefined} className="flex items-start gap-1.5 text-t15 font-bold leading-snug text-warnink">
              <Warning size={17} className="mt-0.5 flex-none" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{explain.join(" · ")}</span>
            </p>
          )}
          <FixChips fixes={fixes} onApply={onFix} live={live} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-rule2 pt-3 sm:grid-cols-6 [@media(max-height:820px)]:gap-y-1.5 [@media(max-height:820px)]:pt-1.5">
        <QField label="年月日" gloss={g.date} value={tx.date ?? tx.date_raw ?? ""} field="date" span="sm:col-span-2"
          flagged={flagged === "date"} live={live} onCommit={text("date")} />
        <QField label="区分" gloss={g.kind} value={tx.kind ?? ""} field="kind" span="sm:col-span-1" live={live} onCommit={text("kind")}
          extra={sugChip("kind", sugKind)} />
        <QField label="摘要" gloss={g.desc} value={tx.description ?? ""} field="description" span="col-span-2 sm:col-span-3"
          flagged={flagged === "description"} live={live} onCommit={text("description")} extra={sugChip("description", sugDesc)} />
        <QField label={t.colOut} gloss={g.out} value={yen(tx.amount_out)} field="amount_out" money span="sm:col-span-2"
          invalidHint={t.cellNumberOnly} live={live} onCommit={num("amount_out")} />
        <QField label={t.colIn} gloss={g.in} value={yen(tx.amount_in)} field="amount_in" money span="sm:col-span-2"
          invalidHint={t.cellNumberOnly} live={live} onCommit={num("amount_in")} />
        <QField label={t.colBal} gloss={g.bal} value={yen(tx.balance)} field="balance" money span="col-span-2 sm:col-span-2"
          flagged={flagged === "balance"} invalidHint={t.cellNumberOnly} live={live} onCommit={num("balance")} />
      </div>
    </div>
  );
}

/** Soát xong: một khoảnh khắc thật, nhưng vẫn nói đúng sự thật. Còn dòng lệch chuỗi thì nói thẳng ra, không khoe «khớp». */
function DonePanel({
  t,
  count,
  breaks,
  onExport,
  onBack,
}: {
  t: Dict;
  count: number;
  breaks: number;
  onExport: () => void;
  onBack: () => void;
}) {
  return (
    <div data-testid="quick-done" className="mx-auto flex w-full max-w-[640px] gap-6 py-8 max-sm:flex-col max-sm:gap-4 max-sm:py-2">
      <Seal size={104} press className="[animation-delay:260ms]" />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-t28 font-bold leading-tight">{t.qrDoneTitle}</h2>
        <p className="tnum text-t15 text-ink2">{t.qrDoneCount(count)}</p>
        {breaks === 0 ? (
          <>
            <p className="mt-2 text-t18 font-bold">残高チェーン検証済</p>
            <p className="text-t15 leading-relaxed text-ink2 [text-wrap:pretty]">{t.qrDoneChainOk}</p>
          </>
        ) : (
          <p data-testid="quick-done-breaks" className="mt-2 flex items-start gap-2 text-t15 font-bold leading-relaxed text-shu">
            <LinkBreak size={18} weight="bold" className="mt-1 flex-none" />
            <span className="min-w-0 [overflow-wrap:anywhere] [text-wrap:pretty]">{t.qrDoneBreaks(breaks)}</span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button data-testid="quick-export" onClick={onExport} className="btn btn-primary btn-lg">
            {t.exportBtn}
          </button>
          <button data-testid="quick-back" onClick={onBack} className="btn btn-quiet btn-lg">
            {t.qrBackToTable}
          </button>
        </div>
      </div>
    </div>
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
  const reduce = useReducedMotion();
  const order = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const rows = useMemo(() => flattenRows(order, store), [order, store]);
  const pending = useMemo(() => pendingOf(rows), [rows]);

  const [cur, setCur] = useState<string | null>(null);
  const lastIdx = useRef(0);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  /** Lần đổi dòng gần nhất là đi hướng nào, và có đóng dấu dòng nào không: chỉ để chọn chuyển động. */
  const [turn, setTurn] = useState<{ dir: 1 | -1; sealed: string | null }>({ dir: 1, sealed: null });
  const body = useRef<HTMLDivElement>(null);

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
  // Dòng mới luôn mở từ đầu thẻ: ảnh và phép tính là thứ phải nhìn trước
  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [rowKey]);

  const go = (dir: 1 | -1) => {
    if (here.idx < 0) return;
    const next = stepFrom(rows, here.idx, dir);
    if (next) {
      setTurn({ dir, sealed: null });
      setCur(next.key);
    }
  };
  const close = () => onClose(row ? row.ref : null, row ? row.field : null);
  const confirm = () => {
    if (row) {
      setTurn({ dir: 1, sealed: row.key });
      onConfirm(row.ref);                       // dòng hết «cần soát» ⇒ thẻ tự sang dòng kế (resolveCurrent)
    }
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

  const ref = row?.ref;
  const num = (field: EditField) => (v: string) => {
    const r = parseYen(v);
    if (!r.ok) return false;
    if (ref) {
      setTurn({ dir: 1, sealed: null });
      onEdit(ref, field, r.value);
    }
  };
  const text = (field: EditField) => (v: string) => {
    if (ref) {
      setTurn({ dir: 1, sealed: null });
      onEdit(ref, field, v || null);
    }
  };
  const suggestion = (field: DictField, current: string | null) => (ref && !tx?.is_note ? suggest(field, current) : null);

  const [exitLabel, exitKey] = splitKey(t.qrExit);
  const [prevLabel, prevKey] = splitKey(t.qrPrev);
  const [skipLabel, skipKey] = splitKey(t.qrSkip);
  const [okLabel, okKey] = splitKey(t.qrConfirm);
  const custom: Turn = { dir: turn.dir, sealed: turn.sealed != null, still: !!reduce };
  const hasCard = !!(row && tx && sheet && detail && ref);

  return (
    <div data-testid="quick-review" className="@container flex h-full min-h-0 flex-col bg-card">
      <div className="relative flex h-11 flex-none items-center gap-3 whitespace-nowrap border-b border-rule2 px-4">
        {row && sheet ? (
          <>
            <span className="flex-none text-t16 font-bold">{t.qrRemain(pending.length)}</span>
            <span data-testid="quick-progress" className="tnum min-w-0 truncate text-t13 text-ink3">
              {t.qrProgress(prog.k, prog.n, sheet.name)}
            </span>
          </>
        ) : (
          <span className="text-t14 font-bold">{t.qrTitle}</span>
        )}
        <span className="flex-1" />
        <button data-testid="quick-exit" onClick={close} className="btn btn-ghost btn-sm flex-none">
          {exitLabel}
          {exitKey && <kbd className="@max-[640px]:hidden">{exitKey}</kbd>}
        </button>
        {/* Vạch tiến độ không có rãnh: chỉ dài ra theo số dòng đã xong */}
        <span
          aria-hidden
          className="absolute -bottom-px left-0 h-0.5 bg-head transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${seen.size ? ((seen.size - pending.length) / seen.size) * 100 : 0}%` }}
        />
      </div>

      <div ref={body} className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [@media(max-height:820px)]:py-2">
        {/* Một ô lưới chung: thẻ đi và thẻ đến nằm chồng lên nhau, không đẩy nhau */}
        <div className="grid [&>*]:[grid-area:1/1]">
          <SealedRow.Provider value={turn.sealed}>
            <AnimatePresence initial={false} custom={custom}>
              {hasCard && (
                <motion.div
                  key={row.key}
                  custom={custom}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="min-w-0"
                >
                  <RowCard
                    rowKey={row.key}
                    wsId={wsId}
                    sheet={sheet}
                    bands={bandsSheet === ref.sheet ? bands : null}
                    bandsState={bandsSheet === ref.sheet ? bandsState : "loading"}
                    stripIndex={sheetRowIndex(store, ref)}
                    tx={tx}
                    flagged={row.field}
                    explain={detail.explain}
                    fixes={detail.fixes}
                    calc={detail.calc}
                    sugKind={suggestion("kind", tx.kind)}
                    sugDesc={suggestion("description", tx.description)}
                    t={t}
                    text={text}
                    num={num}
                    onSug={(field, right) => {
                      setTurn({ dir: 1, sealed: null });
                      onAcceptSug(ref, field, right);
                    }}
                    onFix={(fix) => {
                      setTurn({ dir: 1, sealed: null });
                      onFix(ref, fix);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </SealedRow.Provider>
          {!hasCard &&
            (seen.size > 0 ? (
              <DonePanel t={t} count={seen.size} breaks={breaks} onExport={onExport} onBack={close} />
            ) : (
              <p data-testid="quick-empty" className="mx-auto w-full max-w-[640px] py-8 text-t15 text-ink2">
                {t.qrNothing}
              </p>
            ))}
        </div>
      </div>

      {/* Thanh nút CỐ ĐỊNH ở chân: thẻ dài (3 đoạn ảnh + 6 ô) cuộn được, nhưng nút xác nhận luôn nằm trong tầm mắt */}
      {row && (
        <div className="flex flex-none items-center gap-1 border-t border-rule bg-card px-4 py-2.5 [@media(max-height:820px)]:py-1.5">
          <button data-testid="quick-prev" onClick={() => go(-1)} disabled={pending.length < 2} className="btn btn-ghost btn-lg px-3">
            <ArrowLeft size={16} />
            <span className="@max-[520px]:hidden">{prevLabel}</span>
            {prevKey && <kbd className="@max-[640px]:hidden">{prevKey}</kbd>}
          </button>
          <button data-testid="quick-skip" onClick={() => go(1)} disabled={pending.length < 2} className="btn btn-ghost btn-lg px-3">
            <span className="@max-[520px]:hidden">{skipLabel}</span>
            <ArrowRight size={16} />
            {skipKey && <kbd className="@max-[640px]:hidden">{skipKey}</kbd>}
          </button>
          <span className="min-w-2 flex-1" />
          <button data-testid="quick-confirm" onClick={confirm} aria-label={t.qrConfirm} className="btn btn-seal btn-lg min-w-0">
            <Stamp size={18} weight="fill" className="flex-none" />
            <span className="truncate">{okLabel}</span>
            {okKey && <kbd className="@max-[640px]:hidden">{okKey}</kbd>}
          </button>
        </div>
      )}
    </div>
  );
}
