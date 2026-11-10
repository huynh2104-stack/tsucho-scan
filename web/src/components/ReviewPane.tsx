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

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useT, type Dict, type Lang } from "@/lib/i18n";
import {
  FIELD_LABEL,
  analyzeRows,
  editChanges,
  explainOpen,
  explainReason,
  isISO,
  parseReasons,
  parseYen,
  signedNum,
  type RowInfo,
  type SheetLink,
} from "@/lib/review";
import type { AccountMeta, EditField, ResultStore, Sheet, Tx } from "@/lib/api";
import { followersOf, type BlockRef, type MetaDraft } from "@/lib/bookinfo";
import type { DictField } from "@/lib/corrections";
import { renderProbe } from "@/lib/renderProbe";
import BookInfoDialog from "@/components/BookInfoDialog";
import Seal from "@/components/ui/Seal";
import Segmented from "@/components/ui/Segmented";
import {
  ArrowCounterClockwise,
  Check,
  CircleNotch,
  Lightbulb,
  LinkBreak,
  LinkSimple,
  MagicWand,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Warning,
  X,
} from "@/components/ui/icons";

const yen = (v: number | null) => (v == null ? "" : v.toLocaleString("en-US"));
/** Nhãn ở chân khối: số đã nằm ngay dưới nên bỏ dấu hai chấm của từ điển. */
const plainLabel = (s: string) => s.replace(/[:：]\s*$/, "");

/** Chuỗi từ điển còn ký tự tượng trưng ở đầu (⚠ ⛓): nay đã có biểu tượng vẽ thật nên bỏ ký tự đi khi hiện. */
export const noGlyph = (s: string) => s.replace(/^[⚠⛓✓]\uFE0F?\s*/u, "");

/** Hiệu ứng chuỗi chỉ trễ dần tới dòng này: sổ dài hơn thì phần còn lại hiện cùng lúc, không bắt người chờ. */
const CHAIN_CAP = 40;
/** Thời gian giữ hiệu ứng sau một lần quét mới (ms). */
const CHAIN_MS = 1600;
/** Kết quả quét trong vòng từng này giây mới vẽ chuỗi: mở lại hồ sơ cũ thì không. */
const FRESH_S = 30;
const NOT_FRESH: ReadonlySet<string> = new Set();
/** Số dòng kẻ trống của sổ chưa có kết quả. */
const BLANK_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Mắt xích của một dòng. Dòng không in số dư (検算 ―) chưa chứng minh được gì nên chỉ là vạch ngang, không phải mắt khép kín. */
function chainLink(info: RowInfo, first: boolean, last: boolean): string {
  if (info.state === "note") return "note";
  if (info.state === "confirmed") return "sealed";
  if (info.need) return "open";
  if (first) return "first";
  if (last) return "last";
  return info.chk === "OK" ? "ok" : "note";
}

export type OptCols = { store: boolean; extra: boolean; kind: boolean };
/** Lựa chọn của người dùng. `store: null` = chưa chọn: cột 取扱店 tự hiện khi sổ có dữ liệu cột đó (cột trống chỉ tốn chỗ của 摘要). */
export type ColPrefs = Omit<OptCols, "store"> & { store: boolean | null };
export type ViewMode = "page" | "list";

/** Địa chỉ một dòng trong kho: mặt sổ nào, khối nào, dòng thứ mấy. */
export type TxRef = { sheet: string; block: number; row: number };
export type EditFn = (ref: TxRef, field: EditField, value: string | number | null) => void;
export type RowActionFn = (ref: TxRef) => void;
/** Trả một ô về giá trị MÁY ĐỌC (nút ↺). */
export type RestoreFn = (ref: TxRef, field: EditField) => void;

/** Đầu bảng — một component riêng, `memo` theo (cột phụ, từ điển ngôn ngữ). */
const TableHead = memo(function TableHead({ cols, t }: { cols: OptCols; t: Dict }) {
  const g = t.colGloss;
  return (
    <>
      <colgroup>
        <col className="c-row" />
        <col className="c-date" />
        {cols.kind && <col className="c-kind" />}
        <col />
        <col className="c-out" />
        <col className="c-in" />
        <col className="c-bal" />
        {cols.store && <col className="c-store" />}
        {cols.extra && <col className="c-extra" />}
        <col className="c-chk" />
        <col className="c-memo" />
        <col className="c-act" />
      </colgroup>
      <thead>
        <tr>
          <Th jp="行" vn="" pin="left" />
          <Th jp="年月日" vn={g.date} />
          {cols.kind && <Th jp="区分" vn={g.kind} />}
          <Th jp="摘要" vn={g.desc} />
          <Th jp="お支払" vn={g.out} align="right" />
          <Th jp="お預り" vn={g.in} align="right" />
          <Th jp="差引残高" vn={g.bal} align="right" />
          {cols.store && <Th jp="取扱店" vn="" />}
          {cols.extra && <Th jp="備考" vn="" />}
          <Th jp="検算" vn="" align="center" tight />
          <th className="ledger-memo-head">
            <span className="ledger-th items-center">
              <span className="ledger-memo-long">確認メモ</span>
              <span className="ledger-memo-short">メモ</span>
            </span>
          </th>
          <Th jp="" vn="" pin="right" />
        </tr>
      </thead>
    </>
  );
});

function Th({
  jp,
  vn,
  align = "left",
  pin,
  tight = false,
}: {
  jp: string;
  vn: string;
  align?: "left" | "right" | "center";
  /** Ghim mép khi bảng rộng hơn khung và phải cuộn ngang (cột 行 và cột nút). */
  pin?: "left" | "right";
  /** Cột hẹp đúng bằng tên cột: bỏ đệm hai bên. */
  tight?: boolean;
}) {
  return (
    <th data-pin={pin} data-tight={tight ? "" : undefined}>
      <span className={`ledger-th ${align === "right" ? "items-end" : align === "center" ? "items-center" : "items-start"}`}>
        <span>{jp}</span>
        {vn && <span className="max-w-full truncate font-normal opacity-85">{vn}</span>}
      </span>
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
  field,
  align = "left",
  money = false,
  tone,
  tip,
  picked,
  readOnly,
  invalidHint,
  onTab,
  onCommit,
}: {
  value: string;
  /** Ô thuộc trường nào của dòng — phím n đặt con trỏ vào ô theo trường này (`data-field`). */
  field?: EditField;
  align?: "left" | "right" | "center";
  money?: boolean;
  /** Ô chỉ để chép (cột 行) — không cho gõ, nhưng vẫn bôi đen được. */
  readOnly?: boolean;
  tone?: string;
  /** Chữ đầy đủ khi ô hẹp phải cắt bớt. */
  tip?: string;
  /** Nằm trong vùng bôi đen — tô nền để thấy đang chọn tới đâu. */
  picked?: boolean;
  /** Câu báo khi giá trị gõ vào bị từ chối (onCommit trả false). */
  invalidHint?: string;
  /** Nhấn Tab (không Shift) trong ô: trả `true` = đã xử lý (vd nhận gợi ý của từ điển) nên KHÔNG chuyển ô. */
  onTab?: () => boolean;
  /** Trả `false` = từ chối giá trị: ô quay về giá trị cũ và nháy đỏ một lúc. */
  onCommit: (v: string) => void | boolean;
}) {
  /* Sau MỖI lần ghi nhận giá trị phải dựng lại ô (tăng `rev` đổi `key`). Ô là input không kiểm
     soát (`defaultValue`), nên nếu giá trị sau chuẩn hoá TRÙNG giá trị đang hiện — gõ lại
     "2025/4/12" khi ô đã là "2025-04-12", gõ "１２３４" khi ô đã là "1,234" — thì `key={value}`
     không đổi, React không vẽ lại ô và nó giữ nguyên chữ vừa gõ như thể chưa làm gì. */
  const [rev, setRev] = useState(0);
  return (
    <input
      key={`${value}|${rev}`}
      data-cell
      data-field={field}
      data-money={money ? "" : undefined}
      readOnly={readOnly}
      defaultValue={value}
      title={tip}
      onBlur={(e) => {
        const el = e.target;
        if (el.value === value) return;
        if (onCommit(el.value) === false) {
          // `key={value}` không đổi nên React sẽ KHÔNG tự vẽ lại ô: phải trả giá trị cũ bằng tay
          el.value = value;
          el.dataset.invalid = "1";
          el.title = invalidHint ?? "";
          setTimeout(() => {
            delete el.dataset.invalid;
            el.title = "";
          }, 2500);
        } else {
          setRev((r) => r + 1);     // ô được dựng lại với giá trị chuẩn hoá mới nhất
        }
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && onTab?.()) {
          e.preventDefault();
          return;
        }
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
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
      className={`ledger-cell num ${picked ? "bg-accent/25" : ""} ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      } ${tone ?? ""}`}
    />
  );
}

/** Nút «gợi ý + chữ đáp án» của từ điển, nằm đè lên mép phải ô (không chiếm chỗ ⇒ không đẩy dòng, không làm lệch cú bấm).
 *  Lúc thường chỉ lộ biểu tượng cho khỏi che chữ máy đọc; rê chuột / đứng trong ô thì bung ra đủ chữ đáp án. */
function SugChip({ field, right, title, onAccept }: { field: DictField; right: string; title: string; onAccept: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      data-sug={field}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onAccept();
      }}
      className="absolute right-1 top-1/2 z-[2] flex h-7 max-w-[26px] -translate-y-1/2 items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm bg-card px-1.5 text-t12 text-ink shadow-ply transition-[max-width] duration-150 hover:max-w-[80%] focus:max-w-[80%] group-focus-within/c:max-w-[80%] group-hover/c:max-w-[80%]"
    >
      <Lightbulb size={14} className="flex-none text-accent" />
      {right}
    </button>
  );
}

function RowImpl({
  tx,
  n,
  last,
  gap,
  cols,
  info,
  ref_,
  dim,
  sel,
  fresh,
  rowIdx,
  pc0,
  pc1,
  t,
  lang,
  onEdit,
  onDelete,
  onToggleReviewed,
  onRestore,
  onSelect,
  sugDesc,
  sugKind,
  onAcceptSug,
}: {
  tx: Tx;
  n: number;
  /** Dòng cuối của khối — đường chuỗi dừng ở đây. */
  last: boolean;
  /** Dòng ngay dưới là mắt xích đứt: đường chuỗi của dòng này dừng sớm để chỗ đứt vắt qua ranh hai dòng. */
  gap: boolean;
  cols: OptCols;
  /** Kết quả của định nghĩa「cần soát」dùng chung (lib/review.ts) — Row không tự tính gì. */
  info: RowInfo;
  ref_: TxRef;
  /** Đang lọc và dòng này không khớp → làm mờ thay vì ẩn, để không mất mạch sổ. */
  dim: boolean;
  sel: boolean;
  /** Mặt sổ vừa quét xong: dòng lắng vào cùng lúc đường chuỗi được vẽ. */
  fresh: boolean;
  /** Số thứ tự dòng trong TOÀN lưới — toạ độ hàng của vùng bôi đen. */
  rowIdx: number;
  /** Các cột của dòng này nằm trong vùng bôi đen: từ `pc0` tới `pc1` (cả hai −1 = dòng không nằm trong vùng).
   *  Là SỐ chứ không phải hàm: hàm mới sau mỗi lần đổi vùng chọn thì mọi dòng vẽ lại, số thì chỉ dòng nào đổi mới vẽ lại. */
  pc0: number;
  pc1: number;
  t: Dict;
  lang: Lang;
  onEdit: EditFn;
  onDelete: RowActionFn;
  onToggleReviewed: RowActionFn;
  onRestore: RestoreFn;
  onSelect: RowActionFn;
  /** Chữ từ điển sửa lỗi gợi ý cho ô 摘要 / 区分 (null = không có). Chỉ dòng thật, và chỉ khi ô chưa đúng. */
  sugDesc: string | null;
  sugKind: string | null;
  onAcceptSug: (ref: TxRef, field: DictField, right: string) => void;
}) {
  renderProbe("Row");
  const sug = { description: sugDesc, kind: sugKind };
  const { chk, state } = info;
  const flag = state === "review";
  const fixed = state === "fixed";
  const confirmed = state === "confirmed";
  const note = state === "note";
  // Dấu 検印 chỉ ấn đúng lần dòng vừa được xác nhận; dòng đã xác nhận từ trước thì nằm yên. Phải cùng `rid`: chèn hay xoá dòng
  // làm vị trí này đổi sang dòng khác thì không phải ai vừa đóng dấu. Giữ cờ cho tới khi dòng đổi trạng thái: nếu tắt ngay ở lần
  // vẽ sau (chọn sang dòng kế) thì hiệu ứng bị cắt giữa chừng.
  const seal = useRef({ rid: tx.rid, on: confirmed, press: false }).current;
  if (seal.on !== confirmed || seal.rid !== tx.rid) {
    seal.press = confirmed && !seal.on && seal.rid === tx.rid;
    seal.on = confirmed;
    seal.rid = tx.rid;
  }
  // Ngày là thủ phạm (hỏng/trống) thì tô thêm ô ngày để mắt tìm ra ngay
  const dateBad = flag && !isISO(tx.date);
  const fmt = (v: string | number | null | undefined) =>
    v == null || v === "" ? t.emptyValue : typeof v === "number" ? yen(v) : String(v);
  // Những ô người đã sửa: máy đọc → hiện tại (lời chú ở cột 確認メモ)
  const changes = editChanges(tx);
  const hasOrig = changes.length > 0;
  const editTip = changes.map((c) => `${FIELD_LABEL[c.field]}: ${fmt(c.from)} → ${fmt(c.to)}`).join("\n");
  /** Nút nhỏ trong ô, chỉ hiện khi rê chuột vào ô ĐÃ BỊ SỬA: bấm để trả về giá trị máy đọc. */
  const restore = (f: EditField, side: "l" | "r" = "r") => {
    const o = tx.orig;
    if (!o || !(f in o)) return null;
    return (
      <button
        type="button"
        tabIndex={-1}
        data-act="restore"
        data-restore={f}
        onClick={(e) => {
          e.stopPropagation();
          onRestore(ref_, f);
        }}
        title={t.restoreTitle(fmt(o[f]))}
        aria-label={t.restoreTitle(fmt(o[f]))}
        className={`ledger-restore opacity-0 transition-opacity duration-100 focus:opacity-100 group-hover/c:opacity-100 ${
          side === "l" ? "left-0.5" : "right-0.5"
        }`}
      >
        <ArrowCounterClockwise size={12} weight="bold" />
      </button>
    );
  };
  // Cột 確認メモ của dòng vàng: chỉ những lý do CHƯA giải quyết, dịch sang ngôn ngữ đang dùng
  // (chuỗi tiếng Nhật gốc của máy nằm trong tooltip). Dòng do người thêm cũng được nhắc rõ.
  const memo = flag ? explainOpen(tx, info, lang).join(" · ") : "";
  // Dòng máy đã tự sửa: ghi máy đã làm gì, cũng bằng ngôn ngữ đang dùng
  const fixedMemo = fixed
    ? parseReasons(tx.reason)
        .map((r) => explainReason(r, lang))
        .join(" · ")
    : "";

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
  const on = (c: number) => pc0 >= 0 && c >= pc0 && c <= pc1;

  return (
    <tr
      data-row={`${ref_.sheet}:${ref_.block}:${ref_.row}`}
      data-state={state}
      data-sel={sel ? "" : undefined}
      onClick={() => onSelect(ref_)}
      /* Đi bằng bàn phím cũng phải kéo theo vệt đỏ trên ảnh, không thì gõ tới
         dòng nào mà ảnh vẫn đứng ở dòng cũ. Sự kiện focus có nổi bọt lên tr. */
      onFocus={() => onSelect(ref_)}
      style={{ "--i": Math.min(n - 1, CHAIN_CAP) } as CSSProperties}
      className={`group ${fresh ? "row-in" : ""} ${dim ? "opacity-25" : ""}`}
    >
      {/* Cột 行 là lề của đường chuỗi. KHÔNG sửa được nhưng vẫn phải bôi đen chép được: người dùng
          muốn dán sang Excel kèm số dòng để đối chiếu với sổ giấy.
          `readOnly` + con trỏ mặc định → nhìn và cư xử y như ô chữ thường. */}
      <td
        className="chain"
        data-link={chainLink(info, n === 1, last)}
        data-end={n === 1 ? "first" : last ? "last" : undefined}
        data-gap={gap ? "" : undefined}
      >
        {confirmed && (
          <span className="ledger-chain-seal">
            <Seal size={18} press={seal.press} />
          </span>
        )}
        <Cell
          value={tx.row_no != null ? String(tx.row_no).padStart(2, "0") : String(n).padStart(2, "0")}
          readOnly
          tone={flag ? "font-bold text-shu" : ""}
          picked={on(cRow)}
          onCommit={() => {}}
        />
      </td>
      <td className={`group/c relative ${dateBad ? "bg-warnbg" : ""}`}>
        <Cell
          value={tx.date ?? tx.date_raw ?? ""}
          field="date"
          tone={dateBad ? "text-warnink" : ""}
          picked={on(cDate)}
          onCommit={(v) => onEdit(ref_, "date", v || null)}
        />
        {restore("date")}
      </td>
      {cols.kind && (
        <td className="group/c relative">
          <Cell
            value={tx.kind ?? ""}
            field="kind"
            tone="text-t13 text-ink2"
            tip={tx.kind ?? undefined}
            picked={on(cKind)}
            onTab={sug.kind ? () => (onAcceptSug(ref_, "kind", sug.kind as string), true) : undefined}
            onCommit={(v) => onEdit(ref_, "kind", v || null)}
          />
          {sug.kind && (
            <SugChip
              field="kind"
              right={sug.kind}
              title={t.dictSuggestTitle(sug.kind)}
              onAccept={() => onAcceptSug(ref_, "kind", sug.kind as string)}
            />
          )}
          {restore("kind", sug.kind ? "l" : "r")}
        </td>
      )}
      <td className={`group/c relative ${flag ? "bg-warnbg" : ""}`}>
        <Cell
          value={tx.description ?? ""}
          field="description"
          tone={flag ? "text-warnink" : ""}
          tip={tx.description ?? undefined}
          picked={on(cDesc)}
          onTab={sug.description ? () => (onAcceptSug(ref_, "description", sug.description as string), true) : undefined}
          onCommit={(v) => onEdit(ref_, "description", v || null)}
        />
        {sug.description && (
          <SugChip
            field="description"
            right={sug.description}
            title={t.dictSuggestTitle(sug.description)}
            onAccept={() => onAcceptSug(ref_, "description", sug.description as string)}
          />
        )}
        {restore("description", sug.description ? "l" : "r")}
      </td>
      {/* Tiền ra màu 朱 nhạt, tiền vào mực xanh. Ô trống để trống hẳn: bảng tiền càng ít nét thừa càng dễ dò */}
      <td className={`group/c relative ${fixed ? "bg-okbg" : ""}`}>
        <Cell
          value={yen(tx.amount_out)}
          field="amount_out"
          align="right"
          money
          tone={fixed ? "text-okink" : "text-outink"}
          picked={on(cOut)}
          invalidHint={t.cellNumberOnly}
          onCommit={(v) => {
            const r = parseYen(v);
            if (!r.ok) return false;
            onEdit(ref_, "amount_out", r.value);
          }}
        />
        {restore("amount_out", "l")}
      </td>
      <td className={`group/c relative ${fixed ? "bg-okbg" : ""}`}>
        <Cell
          value={yen(tx.amount_in)}
          field="amount_in"
          align="right"
          money
          tone={fixed ? "text-okink" : "text-inink"}
          picked={on(cIn)}
          invalidHint={t.cellNumberOnly}
          onCommit={(v) => {
            const r = parseYen(v);
            if (!r.ok) return false;
            onEdit(ref_, "amount_in", r.value);
          }}
        />
        {restore("amount_in", "l")}
      </td>
      <td className={`group/c relative ${flag ? "bg-warnbg" : ""}`}>
        <Cell
          value={yen(tx.balance)}
          field="balance"
          align="right"
          money
          tone={flag ? "font-bold text-warnink" : note ? "text-ink2" : "font-bold text-ink"}
          picked={on(cBal)}
          invalidHint={t.cellNumberOnly}
          onCommit={(v) => {
            const r = parseYen(v);
            if (!r.ok) return false;
            onEdit(ref_, "balance", r.value);
          }}
        />
        {restore("balance", "l")}
      </td>
      {cols.store && (
        <td className="group/c relative">
          <Cell
            value={tx.store_code ?? ""}
            field="store_code"
            tone="text-t13 text-ink2"
            picked={on(cStore)}
            onCommit={(v) => onEdit(ref_, "store_code", v || null)}
          />
          {restore("store_code")}
        </td>
      )}
      {cols.extra && (
        <td className="group/c relative">
          <Cell
            value={tx.extra_text ?? ""}
            field="extra_text"
            tone="text-t13 text-ink2"
            tip={tx.extra_text ?? undefined}
            picked={on(cExtra)}
            onCommit={(v) => onEdit(ref_, "extra_text", v || null)}
          />
          {restore("extra_text")}
        </td>
      )}
      <td
        /* relative: chữ ẩn bên trong là position:absolute, không có mốc ở đây thì nó thoát khỏi khung cuộn và làm cả trang tràn ngang */
        className="num relative text-center text-t12 font-bold text-shu"
        title={tx.reason || chk}
      >
        {/* Khớp thì để trống: lặp chữ OK cả cột chỉ làm nhiễu, chỗ NG mới là thứ mắt phải bắt được */}
        {chk === "NG" ? chk : <span className="sr-only">{chk}</span>}
      </td>
      <td className="ledger-memo-cell" title={[editTip, tx.reason].filter(Boolean).join("\n") || undefined}>
        <div className="ledger-memo">
          {flag && memo && (
            <>
              <Warning size={14} className="flex-none text-warnink" />
              <span className="ledger-memo-text text-warnink">{memo}</span>
            </>
          )}
          {fixed && (
            <>
              <MagicWand size={14} className="flex-none text-okink" />
              <span className="ledger-memo-text text-okink">{fixedMemo}</span>
            </>
          )}
          {confirmed && (
            <>
              <Check size={14} className="flex-none text-ink3" />
              <span className="ledger-memo-text text-ink2">{t.rowConfirmed}</span>
              {hasOrig && <PencilSimple size={13} className="ledger-memo-extra flex-none text-ink3" />}
            </>
          )}
          {state === "edited" && (
            <>
              <PencilSimple size={14} className="flex-none text-ink3" />
              <span className="ledger-memo-text text-ink2">
                {tx.dict_fixed?.length ? t.rowDictFixed : hasOrig ? t.rowEdited : t.rowInferred}
              </span>
            </>
          )}
        </div>
      </td>
      {/* Ghim sát mép phải: bảng rộng hơn khung thì phải cuộn ngang mới tới cột này, mà ✓ là nút
          hay bấm nhất — không được để nó nằm ngoài tầm mắt. */}
      <td className="ledger-act">
        <div className="ledger-act-row">
          {/* Dấu 検印 nằm trên đường chuỗi ở cột 行; nút này chỉ là chỗ bật / tắt nó. Dòng cần soát và dòng đã soát luôn hiện nút;
              dòng khác chỉ hiện khi rê chuột hoặc đang chọn. Dòng ghi chú (繰越…) không có nút vì không bao giờ cần soát. */}
          {!note && (
            <button
              data-act="confirm"
              data-due={flag ? "" : undefined}
              data-keep={flag || confirmed ? "" : undefined}
              onClick={() => onToggleReviewed(ref_)}
              title={confirmed ? t.rowUnconfirmTitle : `${t.rowConfirmTitle} (Ctrl+Enter)`}
              aria-label={confirmed ? t.rowUnconfirmTitle : t.rowConfirmTitle}
              aria-pressed={confirmed}
              className="ledger-act-btn"
            >
              <Check size={15} weight="bold" />
            </button>
          )}
          <button onClick={() => onDelete(ref_)} title={t.deleteRow} aria-label={t.deleteRow} className="ledger-act-btn">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* `memo` + các hàm xử lý có danh tính cố định (`useStable` ở trang) ⇒ chọn một dòng chỉ vẽ lại đúng hai dòng (dòng bỏ chọn
   và dòng được chọn) thay vì cả bảng (task 3.5). */
const Row = memo(RowImpl);

/** Dải mảnh báo chỗ nối số dư với mặt sổ đứng ngay trước (task 1.6). CAO CỐ ĐỊNH: dải đổi từ
 *  «nối liền» sang «đứt» khi người dùng vừa sửa một số mà cao thấp khác nhau thì cả bảng bên dưới
 *  giật đúng lúc đang nhấn chuột. Trạng thái không kiểm được / khác sổ thì không hiện gì. */
function LinkStrip({
  link,
  fromName,
  t,
  onDismiss,
  onUndismiss,
}: {
  link: SheetLink;
  fromName: string;
  t: Dict;
  onDismiss: (l: SheetLink) => void;
  onUndismiss: (to: string) => void;
}) {
  if (link.status !== "ok" && link.status !== "break") return null;
  if (link.status === "ok") {
    return (
      <div data-link="ok" className="ledger-link ledger-bleed">
        <LinkSimple size={14} className="flex-none text-accent" />
        <span className="truncate">{noGlyph(t.linkOk(fromName))}</span>
      </div>
    );
  }
  const diff = signedNum(link.diff ?? 0);
  if (link.dismissed) {
    return (
      <div data-link="dismissed" className="ledger-link ledger-bleed">
        <LinkSimple size={14} className="flex-none text-ink3" />
        <span className="min-w-0 flex-1 truncate">{noGlyph(t.linkDismissed)}</span>
        <button className="btn btn-ghost btn-sm flex-none" onClick={() => onUndismiss(link.to)}>
          {t.linkUndismiss}
        </button>
      </div>
    );
  }
  if (!link.sameBook) {
    // Ảnh chụp lẻ không có số tài khoản: lệch là chuyện thường, chỉ nói nhẹ nhàng
    const text = noGlyph(t.linkWeak(diff));
    return (
      <div data-link="weak" title={text} className="ledger-link ledger-bleed">
        <LinkBreak size={14} className="flex-none text-ink3" />
        <span className="truncate">{text}</span>
      </div>
    );
  }
  const text = noGlyph(t.linkBreak(diff));
  return (
    <div data-link="break" title={text} className="ledger-link ledger-bleed">
      <LinkBreak size={14} weight="bold" className="flex-none" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button className="btn btn-quiet btn-sm flex-none" onClick={() => onDismiss(link)}>
        {t.linkNotError}
      </button>
    </div>
  );
}

/** Một thẻ sổ: đầu thẻ, bảng, chân thẻ có tổng.
 *
 * ĐỊNH NGHĨA Ở MỨC MODULE, không lồng trong ReviewPane: component khai báo bên
 * trong một component khác là kiểu MỚI sau mỗi lần render, khiến React tháo và
 * dựng lại toàn bộ cây con — mất vị trí cuộn và mất focus khi đang gõ.
 */
function AccountCardImpl({
  meta,
  rows,
  sheetId,
  blockIdx,
  index,
  ofTotal,
  fallbackTitle,
  sourceLabel,
  cols,
  t,
  lang,
  filter,
  onEdit,
  onDeleteRow,
  onToggleReviewed,
  onRestore,
  onConfirmAll,
  onAddRow,
  onAutoBalance,
  onEditMeta,
  suggest,
  onAcceptSug,
  selectedRow,
  onSelectRow,
  rowBase,
  sel,
  draw,
}: {
  meta: AccountMeta;
  rows: Tx[];
  sheetId: string;
  blockIdx: number;
  index: number;
  /** Tổng số sổ trong mặt này — chỉ >1 mới cần đánh số cho khỏi lẫn. */
  ofTotal: number;
  fallbackTitle: string;
  /** Tên file gốc + số trang, để biết dòng này đến từ đâu. */
  sourceLabel: string;
  cols: OptCols;
  t: Dict;
  lang: Lang;
  filter: string;
  onEdit: EditFn;
  onDeleteRow: RowActionFn;
  onToggleReviewed: RowActionFn;
  onRestore: RestoreFn;
  onConfirmAll: (sheet: string, block: number) => void;
  /** Chèn một dòng trống NGAY DƯỚI dòng `ref`. */
  onAddRow: (ref: TxRef) => void;
  onAutoBalance: (sheet: string, block: number) => void;
  /** Mở hộp sửa thông tin sổ (銀行名/店番号/口座番号/名義) của khối này. */
  onEditMeta: (sheet: string, block: number) => void;
  /** Gợi ý của từ điển sửa lỗi cho một ô (null = không có). */
  suggest: (field: DictField, text: string | null | undefined) => string | null;
  onAcceptSug: (ref: TxRef, field: DictField, right: string) => void;
  /** Chỉ số dòng đang chọn NẾU nó nằm trong khối này (null = không). Truyền cả `TxRef` thì mọi thẻ vẽ lại mỗi lần chọn dòng. */
  selectedRow: number | null;
  onSelectRow: (ref: TxRef) => void;
  /** Số thứ tự dòng đầu tiên của khối này trong TOÀN lưới. */
  rowBase: number;
  /** Vùng bôi đen, hoặc null nếu vùng đó KHÔNG chạm tới khối này (để các thẻ khác không vẽ lại khi kéo chuột). */
  sel: Rect | null;
  /** Mặt sổ vừa quét xong: đường chuỗi tự vẽ từ trên xuống một lần. */
  draw: boolean;
}) {
  renderProbe("AccountCard");
  // Địa chỉ từng dòng: tạo MỘT lần cho mỗi (mặt sổ, khối, số dòng) để `Row` (memo) thấy cùng một tham chiếu
  const refs = useMemo(
    () => rows.map((_, ri) => ({ sheet: sheetId, block: blockIdx, row: ri })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetId, blockIdx, rows.length],
  );
  // Một lượt tính cho cả khối: cột 検算, trạng thái từng dòng, số dòng cần soát
  // `analyzeRows` trả đối tượng MỚI cho mọi dòng mỗi khi `rows` đổi (dù chỉ sửa một ô) — giữ lại đối tượng cũ của những dòng
  // kết quả y hệt để `Row` (memo) không vẽ lại cả khối chỉ vì một dòng đổi.
  const prevInfos = useRef<RowInfo[]>([]);
  const infos = useMemo(() => {
    const before = prevInfos.current;
    return analyzeRows(rows).map((x, i) => {
      const p = before[i];
      return p && p.chk === x.chk && p.state === x.state && p.need === x.need && p.field === x.field && p.diff === x.diff ? p : x;
    });
  }, [rows]);
  useEffect(() => {
    prevInfos.current = infos;
  }, [infos]);
  const real = rows.filter((r) => !r.is_note);
  const needCheck = infos.filter((i) => i.need).length;
  // Mọi dòng thật đã ✓ rồi thì nút「Xác nhận cả mặt sổ」không còn việc gì để làm
  const allConfirmed = real.every((r) => r.reviewed);
  // 「+ Thêm dòng」chèn ngay dưới dòng đang chọn (nếu nó nằm trong thẻ này), không thì xuống cuối
  const insertAfter =
    selectedRow != null && selectedRow < refs.length ? refs[selectedRow] : refs[refs.length - 1];

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
    <section className="bg-card">
      <header
        data-account-head
        title={sourceLabel}
        className="ledger-bleed flex h-[calc(36px*var(--fs))] items-center gap-2 overflow-hidden whitespace-nowrap pl-[22px] pr-2"
      >
        {/* Chỉ đánh số khi MỘT mặt sổ chứa nhiều sổ khác nhau — nếu không, con
            số này nằm cạnh số thứ tự mặt sổ và gây nhầm hai thứ khác nhau. */}
        {ofTotal > 1 && <span className="tag tnum flex-none">{t.accountNo(index + 1, ofTotal)}</span>}
        {/* Không có bìa sổ thì model không biết tên ngân hàng. Ghi tên mặt sổ
            thay vì "(chưa rõ ngân hàng)" — vừa gọn vừa cho biết đang xem gì. */}
        <span className="min-w-[4em] truncate text-t14 font-bold">{meta.bank_name || fallbackTitle}</span>
        {meta.account_no && <span className="num flex-none text-t13 text-ink3">{meta.account_no}</span>}
        <button
          data-act="edit-meta"
          onClick={() => onEditMeta(refs[0].sheet, refs[0].block)}
          title={t.bookInfoEdit}
          aria-label={t.bookInfoEdit}
          className="btn btn-ghost btn-sm btn-icon flex-none"
        >
          <PencilSimple size={15} />
        </button>
        <span className="flex-1" />
        {q && <span className="tag tnum flex-none">{t.matched(counted.length)}</span>}
        <span className="tag tnum flex-none @max-[560px]/ledger:hidden">
          {t.statusRows(real.length)}
        </span>
        {ofTotal > 1 && needCheck > 0 && <span className="tag tag-warn tnum flex-none">{t.stNeedCheck(needCheck)}</span>}
        <button
          data-act="confirm-all"
          onClick={() => onConfirmAll(refs[0].sheet, refs[0].block)}
          disabled={allConfirmed}
          title={t.confirmAllHint}
          aria-label={ofTotal > 1 ? t.confirmAllBook : t.confirmAll}
          className="btn btn-quiet btn-sm flex-none"
        >
          <Check size={14} />
          <span className="@max-[480px]/ledger:hidden">{ofTotal > 1 ? t.confirmAllBook : t.confirmAll}</span>
        </button>
      </header>

      <div className={draw ? "chain-draw" : undefined}>
        <table className="ledger-table">
          <TableHead cols={cols} t={t} />
          <tbody>
            {rows.map((tx, i) => (
              <Row
                key={`${refs[i].sheet}-${refs[i].block}-${refs[i].row}`}
                tx={tx}
                n={i + 1}
                last={i === rows.length - 1}
                gap={i + 1 < rows.length && infos[i + 1].need}
                cols={cols}
                info={infos[i]}
                ref_={refs[i]}
                dim={!!q && !matches(tx)}
                sel={selectedRow === i}
                fresh={draw}
                rowIdx={rowBase + i}
                pc0={sel && rowBase + i >= sel.r0 && rowBase + i <= sel.r1 ? sel.c0 : -1}
                pc1={sel && rowBase + i >= sel.r0 && rowBase + i <= sel.r1 ? sel.c1 : -1}
                t={t}
                lang={lang}
                onEdit={onEdit}
                onDelete={onDeleteRow}
                onToggleReviewed={onToggleReviewed}
                onRestore={onRestore}
                onSelect={onSelectRow}
                sugDesc={tx.is_note ? null : suggest("description", tx.description)}
                sugKind={tx.is_note ? null : suggest("kind", tx.kind)}
                onAcceptSug={onAcceptSug}
              />
            ))}
          </tbody>
          {/* Chân khối nằm TRONG bảng: tổng đứng đúng dưới cột của nó như trên sổ kế toán */}
          <tfoot>
            <tr>
              <td colSpan={cols.kind ? 4 : 3}>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => insertAfter && onAddRow(insertAfter)}
                    title={t.addRowHint}
                    className="btn btn-ghost btn-sm"
                  >
                    <Plus size={14} />
                    {t.addRow}
                  </button>
                  <button
                    onClick={() => onAutoBalance(refs[0].sheet, refs[0].block)}
                    title={t.autoBalanceHint}
                    className="btn btn-ghost btn-sm"
                  >
                    {t.autoBalance}
                  </button>
                </div>
              </td>
              <td className="ledger-sum text-outink">
                <span className="ledger-sum-label">{plainLabel(t.totalOut)}</span>
                {yen(totalOut)}
              </td>
              <td className="ledger-sum text-inink">
                <span className="ledger-sum-label">{plainLabel(t.totalIn)}</span>
                {yen(totalIn)}
              </td>
              <td className="ledger-sum text-ink">
                {!q && (
                  <>
                    <span className="ledger-sum-label">{plainLabel(t.lastBalance)}</span>
                    {yen(lastBal ?? null)}
                  </>
                )}
              </td>
              <td colSpan={3 + (cols.store ? 1 : 0) + (cols.extra ? 1 : 0)} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}


const AccountCard = memo(AccountCardImpl);

/** Sổ chưa có dòng nào: đúng đầu bảng thật và vài dòng kẻ trống mờ dần, nên màn hình trống cũng dạy luôn bố cục sẽ hiện. */
function BlankLedger({ cols, t, text, active = false }: { cols: OptCols; t: Dict; text: string; active?: boolean }) {
  const rest = 8 + (cols.kind ? 1 : 0) + (cols.store ? 1 : 0) + (cols.extra ? 1 : 0);
  return (
    <div>
      <div className="relative">
        <table className={`ledger-table ledger-blank ${active ? "ledger-blank-active" : ""}`}>
          <TableHead cols={cols} t={t} />
          <tbody aria-hidden>
            {BLANK_ROWS.map((r) => (
              <tr key={r} style={{ "--i": r } as CSSProperties}>
                <td className="chain" />
                {Array.from({ length: rest }, (_, c) => (
                  <td key={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div aria-hidden className="ledger-blank-fade" />
      </div>
      <p
        role={active ? "status" : undefined}
        className={`ledger-bleed z-[6] -mt-14 flex max-w-[36em] items-center gap-2 pl-[22px] pr-4 text-t15 leading-relaxed [overflow-wrap:anywhere] [text-wrap:balance] ${
          active ? "font-bold text-ink" : "text-ink2"
        }`}
      >
        {active && <CircleNotch size={16} className="flex-none animate-spin text-accent motion-reduce:animate-none" />}
        {text}
      </p>
    </div>
  );
}

/** Bề rộng chữ tính bằng nửa ô: chữ Nhật toàn góc 2, chữ Latin và kana nửa góc 1. */
function halfCells(text: string | null | undefined): number {
  let n = 0;
  for (const ch of text ?? "") n += ch.charCodeAt(0) > 0xff && !(ch >= "\uff61" && ch <= "\uff9f") ? 2 : 1;
  return n;
}

export default function ReviewPane({
  store,
  sheets,
  activeSheet,
  mode,
  cols: colPrefs,
  onToggleCol,
  onModeChange,
  onEdit,
  onDeleteRow,
  onToggleReviewed,
  onRestore,
  onConfirmAll,
  onAddRow,
  onAutoBalance,
  onSaveMeta,
  suggest,
  onAcceptSug,
  links,
  onDismissLink,
  onUndismissLink,
  selected,
  onSelectRow,
  fixBar,
  footer,
  scanText,
}: {
  store: ResultStore;
  sheets: Sheet[];
  activeSheet: string | null;
  mode: ViewMode;
  cols: ColPrefs;
  /** `current`: cột đang hiện hay không (取扱店 tự động nên chỉ người vẽ mới biết). */
  onToggleCol: (k: keyof OptCols, current: boolean) => void;
  onModeChange: (m: ViewMode) => void;
  onEdit: EditFn;
  onDeleteRow: RowActionFn;
  /** Bấm ✓ / bỏ ✓ "đã soát" của một dòng. */
  onToggleReviewed: RowActionFn;
  onRestore: RestoreFn;
  /** 「Xác nhận cả mặt sổ」: ✓ mọi dòng của một khối (có hỏi lại nếu còn dòng NG). */
  onConfirmAll: (sheet: string, block: number) => void;
  /** Chèn một dòng trống ngay dưới dòng `ref`. */
  onAddRow: (ref: TxRef) => void;
  onAutoBalance: (sheet: string, block: number) => void;
  /** Lưu thông tin sổ người dùng vừa sửa; `propagate` = điền luôn cho các mặt sau chưa có thông tin (xem `applyMetaEdit`). */
  onSaveMeta: (ref: BlockRef, draft: MetaDraft, propagate: boolean) => void;
  /** Từ điển sửa lỗi (task 3.3): chữ nên thay cho một ô, và nhận gợi ý đó (bấm 💡 hoặc Tab). */
  suggest: (field: DictField, text: string | null | undefined) => string | null;
  onAcceptSug: (ref: TxRef, field: DictField, right: string) => void;
  /** Kết quả kiểm chỗ nối với mặt sổ đứng trước, khoá theo id mặt sổ ĐƯỢC kiểm (xem `sheetLinks`). */
  links: Record<string, SheetLink>;
  onDismissLink: (link: SheetLink) => void;
  onUndismissLink: (sheetId: string) => void;
  /** Dòng đang chọn — khung giữa khoanh đúng dải ảnh của dòng này. */
  selected: TxRef | null;
  onSelectRow: (ref: TxRef) => void;
  /** Thanh gợi ý sửa, đặt ngay dưới đầu sổ (không truyền thì không vẽ gì). */
  fixBar?: ReactNode | null;
  /** Tên sổ + nút xuất file: nằm cùng thanh chân sổ để bảng không mất thêm một thanh. */
  footer?: ReactNode;
  /** Đang quét: câu tiến độ thay cho câu chờ ở sổ trống. */
  scanText?: string;
}) {
  const { t, lang } = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  /** Khối đang mở hộp «Thông tin sổ» (null = đóng). */
  const [metaTarget, setMetaTarget] = useState<BlockRef | null>(null);

  /* ── Bôi đen nhiều ô để chép sang Excel ────────────────────────────
     Kéo chuột từ ô này sang ô khác là chọn cả hình chữ nhật; Ctrl+C chép ra
     dạng ngăn bằng TAB nên dán vào Excel rơi đúng từng ô. */
  const [sel, setSel] = useState<Rect | null>(null);
  const anchor = useRef<{ r: number; c: number } | null>(null);
  const dragging = useRef(false);

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
    const align = () => {
      box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top;
    };
    align();
    // Vừa sang dạng danh sách, các mặt phía trên còn cao tạm 900px (content-visibility): tới khung hình sau mới có chiều cao
    // thật, không canh lại thì dừng lố xuống cuối mặt đang xem.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(align);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSheet, mode, store]);

  const openMeta = useCallback((sheet: string, block: number) => setMetaTarget({ sheet, block }), []);

  /* Lần quét mới của một mặt sổ (job_id / scanned_at đổi trong lúc đang mở): đường chuỗi tự vẽ đúng một lần. Hồ sơ nạp về thì
     danh sách mặt sổ và kết quả tới cùng một lượt, còn kết quả quét luôn tới SAU khi đã có mặt sổ: lượt đầu có mặt sổ chỉ ghi
     mốc, nên F5 ngay sau khi quét không vẽ lại. Đổi sang hồ sơ khác không qua lượt đầu đó, nên vẫn cần điều kiện vừa quét xong. */
  const scanMarks = useRef<Record<string, string> | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NOT_FRESH);
  const hasSheets = sheets.length > 0;
  useEffect(() => {
    if (!hasSheets) return;
    const baseline = scanMarks.current === null;
    const marks = (scanMarks.current ??= {});
    const now = Date.now() / 1000;
    const hit: string[] = [];
    for (const [sid, r] of Object.entries(store)) {
      const mark = `${r.job_id}:${r.scanned_at}`;
      if (marks[sid] === mark) continue;
      marks[sid] = mark;
      if (!baseline && r.blocks?.length && now - r.scanned_at < FRESH_S) hit.push(sid);
    }
    if (hit.length === 0) return;
    setFresh(new Set(hit));
    if (freshTimer.current) clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFresh(NOT_FRESH), CHAIN_MS);
  }, [store, hasSheets]);
  useEffect(
    () => () => {
      if (freshTimer.current) clearTimeout(freshTimer.current);
    },
    [],
  );

  /** Chuỗi dài nhất của cột ngày và các cột tiền, tính cả tổng ở chân khối: cột phải đủ rộng để không số nào bị cắt. */
  const fit = useMemo(() => {
    const ids = mode === "page" ? (activeSheet ? [activeSheet] : []) : scanned.map((s) => s.id);
    let date = 10;
    let out = 0;
    let inn = 0;
    let bal = 0;
    let kind = 0;
    let hasStore = false;
    for (const sid of ids) {
      for (const b of store[sid]?.blocks ?? []) {
        let sumOut = 0;
        let sumIn = 0;
        for (const r of b.rows) {
          date = Math.max(date, (r.date ?? r.date_raw ?? "").length);
          kind = Math.max(kind, halfCells(r.kind));
          hasStore = hasStore || !!r.store_code;
          bal = Math.max(bal, Math.abs(r.balance ?? 0));
          out = Math.max(out, r.amount_out ?? 0);
          inn = Math.max(inn, r.amount_in ?? 0);
          if (r.is_note) continue;
          sumOut += r.amount_out ?? 0;
          sumIn += r.amount_in ?? 0;
        }
        out = Math.max(out, sumOut);
        inn = Math.max(inn, sumIn);
      }
    }
    return { date: Math.min(date, 16), out: yen(out).length, inn: yen(inn).length, bal: yen(bal).length, kind, hasStore };
  }, [mode, activeSheet, scanned, store]);
  const cols = useMemo<OptCols>(
    () => ({ ...colPrefs, store: colPrefs.store ?? fit.hasStore }),
    [colPrefs, fit.hasStore],
  );
  const gridStyle = {
    "--c-kind": fit.kind,
    "--c-date": fit.date,
    "--c-out": fit.out,
    "--c-in": fit.inn,
    "--c-bal": fit.bal,
    "--on-kind": cols.kind ? 1 : 0,
    "--on-store": cols.store ? 1 : 0,
    "--on-extra": cols.extra ? 1 : 0,
  } as CSSProperties;

  const pageName = mode === "page" && activeSheet ? (sheetName[activeSheet] ?? "") : "";
  const rowsHere =
    mode === "page" && activeSheet
      ? (store[activeSheet]?.blocks ?? []).reduce((n, b) => n + b.rows.filter((x) => !x.is_note).length, 0)
      : totalRows;

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
    const link = links[sheetId];
    const cards = data.blocks.map((block, bi) => (
      <AccountCard
        key={`${sheetId}-${bi}`}
        meta={block.meta}
        rows={block.rows}
        sheetId={sheetId}
        blockIdx={bi}
        index={startIndex + bi}
        ofTotal={data.blocks.length}
        sourceLabel={source}
        fallbackTitle={sheetName[sheetId] ?? sheetId}
        cols={cols}
        t={t}
        lang={lang}
        filter={filter}
        onEdit={onEdit}
        onDeleteRow={onDeleteRow}
        onToggleReviewed={onToggleReviewed}
        onRestore={onRestore}
        onConfirmAll={onConfirmAll}
        onAddRow={onAddRow}
        onAutoBalance={onAutoBalance}
        onEditMeta={openMeta}
        suggest={suggest}
        onAcceptSug={onAcceptSug}
        selectedRow={selected && selected.sheet === sheetId && selected.block === bi ? selected.row : null}
        onSelectRow={onSelectRow}
        rowBase={rowBase[`${sheetId}:${bi}`] ?? 0}
        sel={
          sel &&
          (rowBase[`${sheetId}:${bi}`] ?? 0) <= sel.r1 &&
          (rowBase[`${sheetId}:${bi}`] ?? 0) + block.rows.length - 1 >= sel.r0
            ? sel
            : null
        }
        draw={fresh.has(sheetId)}
      />
    ));
    return (
      <>
        {link && (
          <LinkStrip
            link={link}
            fromName={sheetName[link.from] ?? link.from}
            t={t}
            onDismiss={onDismissLink}
            onUndismiss={onUndismissLink}
          />
        )}
        {cards}
      </>
    );
  };

  if (scanned.length === 0) {
    return (
      <div className="ledger-pane flex h-full min-h-0 flex-col bg-card">
        <div className="flex h-11 flex-none items-center border-b border-rule2 px-3">
          <h2 className="text-t14 font-bold">{t.reviewTitle}</h2>
        </div>
        <div className="ledger-grid thin-scroll min-h-0 flex-1 overflow-auto" style={gridStyle}>
          <BlankLedger
            cols={cols}
            t={t}
            active={!!scanText}
            text={scanText ?? (sheets.length > 0 ? t.ledgerBlankNotScanned : t.ledgerBlankNoPages)}
          />
        </div>
        <div className="flex h-11 flex-none items-center gap-2 border-t border-rule px-3">{footer}</div>
      </div>
    );
  }

  return (
    <div className="ledger-pane flex h-full min-h-0 flex-col bg-card">
      {/* Đầu sổ: một dòng CAO CỐ ĐỊNH, chữ dài tự cắt. Bộ lọc chỉ để XEM, không ảnh hưởng file xuất */}
      <div className="flex h-11 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-b border-rule2 px-3">
        <h2 title={t.reviewSubtitle} className="flex min-w-0 flex-1 items-baseline gap-2 @max-[480px]/ledger:hidden">
          <span className="flex-none text-t14 font-bold">{t.reviewTitle}</span>
          {pageName && <span className="min-w-0 truncate text-t13 font-normal text-ink2">{pageName}</span>}
          <span className="tnum flex-none text-t13 font-normal text-ink3">
            {t.statusRows(rowsHere)}
          </span>
        </h2>
        <Segmented
          layoutId="ledger-view"
          label={t.reviewTitle}
          value={mode}
          onChange={onModeChange}
          className="flex-none"
          options={[
            { id: "page", label: t.viewCurrentPage },
            { id: "list", label: `${t.viewAsList} (${scanned.length})` },
          ]}
        />
        <div title={t.filterNote} className="relative min-w-0 flex-[0_1_200px]">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink3" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.filterPlaceholder}
            aria-label={t.filterPlaceholder}
            className={`field min-h-[calc(30px*var(--fs))] truncate pl-7 text-t13 ${filter ? "pr-7" : "pr-2"}`}
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              title={t.filterClear}
              aria-label={t.filterClear}
              className="btn btn-ghost absolute right-0.5 top-1/2 min-h-0 h-6 w-6 -translate-y-1/2 p-0"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Thân cột — CHÍNH khung này cuộn, cả dọc lẫn ngang */}
      {/* data-grid: mốc để phím mũi tên tìm được mọi dòng, kể cả ở thẻ sổ khác */}
      <div
        ref={scroller}
        data-grid
        data-mode={mode}
        onMouseDown={onDown}
        onMouseOver={onOver}
        style={gridStyle}
        className={`ledger-grid thin-scroll min-h-0 flex-1 overflow-auto ${sel ? "select-none" : ""}`}
      >
        {mode === "page" ? (
          !activeSheet ? (
            <BlankLedger cols={cols} t={t} text={t.pickSheetForPage} />
          ) : !store[activeSheet]?.blocks?.length ? (
            <BlankLedger
              cols={cols}
              t={t}
              active={!!scanText}
              text={scanText ?? t.sheetNoResult(sheetName[activeSheet] ?? activeSheet)}
            />
          ) : (
            cardsOf(activeSheet)
          )
        ) : (
          <>
            {scanned.map((s) => (
              <section key={s.id} data-sheet={s.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 900px" }}>
                {/* content-visibility:auto (task 3.5): trình duyệt bỏ qua dàn trang + vẽ các mặt sổ nằm NGOÀI màn hình, nhưng DOM
                    vẫn còn nguyên nên phím mũi tên, focus, bôi đen và chép TSV vẫn chạy. `auto 900px` = cao tạm 900px cho tới
                    khi mặt đó từng được vẽ (sau đó nhớ chiều cao thật). */}
                <h3
                  className={`ledger-bleed top-0 z-[5] flex h-[calc(32px*var(--fs))] items-center gap-2 border-b border-rule pl-[22px] pr-3 text-t13 font-bold ${
                    activeSheet === s.id ? "bg-accentpale text-ink" : "bg-card2 text-ink2"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="tnum flex-none font-normal text-ink3">
                    {t.statusRows(store[s.id].blocks.reduce((n, b) => n + b.rows.length, 0))}
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

      {/* Chân sổ: MỘT thanh CAO CỐ ĐỊNH, luôn có mặt, nên chọn dòng vàng không đẩy bảng đi đâu cả. Dòng cần soát đang chọn thì
          hiện lý do + gợi ý sửa; còn lại hiện cột phụ, nhắc phím và tên sổ. `data-fixbar` nằm ở đây: thứ giữ cao cố định là khung
          này, không phải nội dung. Đang bôi đen thì số ô đã chọn được ưu tiên vì người ta đang chờ nó để chép. */}
      <div data-fixbar className="flex h-11 flex-none items-center gap-1 overflow-hidden whitespace-nowrap border-t border-rule px-3">
        {fixBar && pickedCount === 0 ? (
          fixBar
        ) : (
          <>
            <span className="mr-1 flex-none text-t12 text-ink3 max-lg:hidden">{t.optionalCols}</span>
            {(
              [
                { key: "kind", label: "区分" },
                { key: "store", label: "取扱店" },
                { key: "extra", label: "備考" },
              ] as { key: keyof OptCols; label: string }[]
            ).map((c) => (
              <button
                key={c.key}
                onClick={() => onToggleCol(c.key, cols[c.key])}
                aria-pressed={cols[c.key]}
                className={`btn btn-sm flex-none max-lg:hidden ${
                  cols[c.key] ? "bg-accentpale font-bold text-accent" : "btn-ghost text-ink3"
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="min-w-2 flex-[1_1_0] overflow-hidden px-2 text-right max-lg:hidden">
              {pickedCount > 0 ? (
                <span className="tag text-accent">{t.pickedCells(pickedCount)}</span>
              ) : (
                <span className="block truncate text-t12 text-ink3" title={`${t.dragCopyHint} ${t.editableHint}`}>
                  {t.inspectorHint}
                </span>
              )}
            </span>
            {footer}
          </>
        )}
      </div>


      {metaTarget && store[metaTarget.sheet]?.blocks[metaTarget.block] && (
        <BookInfoDialog
          key={`${metaTarget.sheet}:${metaTarget.block}`}
          meta={store[metaTarget.sheet].blocks[metaTarget.block].meta}
          followers={followersOf(sheets.map((s) => s.id), store, metaTarget).length}
          onCancel={() => setMetaTarget(null)}
          onSave={(draft, propagate) => {
            onSaveMeta(metaTarget, draft, propagate);
            setMetaTarget(null);
          }}
        />
      )}
    </div>
  );
}
