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

import { useEffect, useMemo, useRef, useState } from "react";

import type { ResultStore, Sheet, Tx } from "@/lib/api";
import type { FocusField } from "@/lib/review";
import { useT } from "@/lib/i18n";
import {
  flattenRows,
  pendingOf,
  progress,
  resolveCurrent,
  stepFrom,
  type QRow,
  type RowRef,
} from "@/lib/quickreview";

export default function QuickReview({
  sheets,
  store,
  onActivate,
  onClose,
}: {
  sheets: Sheet[];
  store: ResultStore;
  /** Dòng hiện tại sang mặt sổ khác: đặt mặt đó làm mặt đang xem (ảnh ở giữa đổi theo). */
  onActivate: (sheetId: string) => void;
  /** Thoát. `ref` = dòng đang xem (null nếu đã xong) để bảng nhảy về đúng dòng đó. */
  onClose: (ref: RowRef | null, field: FocusField | null) => void;
}) {
  const { t } = useT();
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

  // Phím: n = bỏ qua, p = quay lại, Esc = thoát. Gõ trong ô thì n/p là chữ, không phải phím lệnh.
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
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name ?? id;
  const tx: Tx | undefined = row ? store[row.ref.sheet]?.blocks[row.ref.block]?.rows[row.ref.row] : undefined;

  return (
    <div data-testid="quick-review" className="flex h-full min-h-0 flex-col bg-page">
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-card px-4 py-2.5">
        <span className="rounded-md bg-accent px-2 py-0.5 text-[12px] font-bold text-accentink">▶ {t.qrTitle}</span>
        {row ? (
          <span data-testid="quick-progress" className="tnum text-[13.5px] font-semibold">
            {t.qrProgress(prog.k, prog.n, sheetName(row.ref.sheet))}
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
        {row && tx ? (
          <div data-testid="quick-card" data-row-key={row.key} className="mx-auto flex max-w-2xl flex-col gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-rule bg-card p-4 text-[16px]">
              <dt className="text-ink3">年月日</dt>
              <dd>{tx.date ?? tx.date_raw ?? "—"}</dd>
              <dt className="text-ink3">区分</dt>
              <dd>{tx.kind ?? "—"}</dd>
              <dt className="text-ink3">摘要</dt>
              <dd>{tx.description ?? "—"}</dd>
              <dt className="text-ink3">出金</dt>
              <dd className="tnum">{tx.amount_out != null ? tx.amount_out.toLocaleString("en-US") : "—"}</dd>
              <dt className="text-ink3">入金</dt>
              <dd className="tnum">{tx.amount_in != null ? tx.amount_in.toLocaleString("en-US") : "—"}</dd>
              <dt className="text-ink3">残高</dt>
              <dd className="tnum">{tx.balance != null ? tx.balance.toLocaleString("en-US") : "—"}</dd>
            </dl>
            <div className="flex items-center gap-2">
              <button
                data-testid="quick-prev"
                onClick={() => go(-1)}
                disabled={pending.length < 2}
                className="rounded-lg border border-rule px-4 py-2 text-[14px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-40"
              >
                ← {t.qrPrev}
              </button>
              <button
                data-testid="quick-skip"
                onClick={() => go(1)}
                disabled={pending.length < 2}
                className="rounded-lg border border-rule px-4 py-2 text-[14px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-40"
              >
                {t.qrSkip} →
              </button>
            </div>
          </div>
        ) : (
          <p data-testid="quick-empty" className="mx-auto max-w-2xl rounded-xl border border-rule bg-card p-4 text-[15px]">
            {t.qrNothing}
          </p>
        )}
      </div>
    </div>
  );
}
