"use client";

/**
 * Bàn làm việc: BA KHUNG hiện cùng lúc, không có màn hình theo bước.
 *
 *   [ kéo thả + mặt sổ ] │ [ chỉnh ảnh ] │ [ kết quả — sửa được ]
 *
 * Quy ước quan trọng, cố ý tách hai ý nghĩa:
 *   • TICK mặt sổ  → chọn để QUÉT (nhiều mặt cùng lúc)
 *   • MẶT ĐANG XEM → đối tượng của mọi thao tác chỉnh ảnh (xoay/cắt/sáng)
 * Trộn hai thứ này từng làm người dùng không hiểu vì sao xoay lại đổi cả ảnh khác.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addSample,
  addSheets,
  adjustSheets,
  autofixApply,
  autofixPlan,
  buildAccounts,
  createWorkspace,
  cropSheet,
  deleteSheet,
  exportFile,
  getJob,
  getWorkspace,
  listenEvents,
  renameBook,
  renameSheet,
  reorderSheets,
  resetSheets,
  rotateSheets,
  rowMap,
  saveBlob,
  splitSheet,
  startScan,
  undoSheet,
  type AutofixPlan,
  type PerSheet,
  type ResultStore,
  type RowBands,
  type ScanEvent,
  type Tx,
  type Workspace,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import DropZone from "@/components/DropZone";
import SheetRail, { Tick, type ScanState } from "@/components/SheetRail";
import SheetViewer from "@/components/SheetViewer";
import ReviewPane, {
  type EditFn,
  type OptCols,
  type RowActionFn,
  type TxRef,
  type ViewMode,
} from "@/components/ReviewPane";
import ExportDialog, { type ExportOpts } from "@/components/ExportDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

const WS_KEY = "tsucho.ws";

/** Số thứ tự phẳng của một dòng trong mặt sổ — khớp với thứ tự dải ảnh. */
function flatRowIndex(store: ResultStore, sheetId: string | null, ref: TxRef): number {
  if (!sheetId) return -1;
  const data = store[sheetId];
  if (!data) return -1;
  let i = 0;
  for (let b = 0; b < data.blocks.length; b++) {
    if (b === ref.block) return i + ref.row;
    i += data.blocks[b].rows.length;
  }
  return -1;
}

export default function Workbench() {
  const { t } = useT();

  const [ws, setWs] = useState<Workspace | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [lastTicked, setLastTicked] = useState<string | null>(null);

  // KHO kết quả theo TỪNG mặt sổ. Trước đây giữ một ScanPayload duy nhất nên
  // quét mặt mới là ghi đè, làm mất kết quả các mặt đã quét — chính là bug cũ.
  const [store, setStore] = useState<ResultStore>({});
  const [states, setStates] = useState<Record<string, ScanState>>({});
  const [autofix, setAutofix] = useState<AutofixPlan | null>(null);

  /* Lịch sử cho Ctrl+Z. Giữ ẢNH CHỤP cả kho: kho là JSON thuần và một mặt sổ
     chỉ vài chục dòng, nên chụp cả cây đơn giản và không thể sai lệch — an toàn
     hơn hẳn lưu từng thao tác nghịch đảo. */
  const [past, setPast] = useState<ResultStore[]>([]);
  const [future, setFuture] = useState<ResultStore[]>([]);

  /** Dòng đang chọn ở bảng kết quả — khung ảnh khoanh đúng dải của dòng này. */
  const [selRow, setSelRow] = useState<TxRef | null>(null);
  const [bands, setBands] = useState<RowBands | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{
    ref: TxRef;
    field: "balance" | "description";
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    warning?: string;
    label: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [mode, setMode] = useState<ViewMode>("page");
  const [cols, setCols] = useState<OptCols>({ store: true, extra: false, kind: true });

  const stopSse = useRef<(() => void) | null>(null);

  // Mở lại không gian làm việc cũ — F5 không mất ảnh đã tải lên
  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem(WS_KEY);
      if (saved) {
        try {
          const w = await getWorkspace(saved);
          setWs(w);
          setStore(w.results ?? {});      // kết quả đã quét sống qua F5
          return;
        } catch {
          localStorage.removeItem(WS_KEY);
        }
      }
      try {
        const fresh = await createWorkspace();
        localStorage.setItem(WS_KEY, fresh.id);
        setWs(fresh);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => stopSse.current?.();
  }, []);

  const sheets = ws?.sheets ?? [];
  const activeSheet = sheets.find((s) => s.id === active) ?? null;

  /** Vị trí dải ảnh của dòng đang chọn (chỉ khi dòng đó thuộc mặt đang xem). */
  const highlight = useMemo(() => {
    if (!selRow || !bands || selRow.sheet !== active) return null;
    const i = flatRowIndex(store, active, selRow);
    return i >= 0 && i < bands.bands.length ? bands.bands[i] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selRow, bands, active, store]);

  /** Thống kê từng mặt sổ, tính lại từ kho — kể cả các ô người dùng vừa sửa. */
  const perSheet: Record<string, PerSheet> = useMemo(() => {
    const out: Record<string, PerSheet> = {};
    for (const [sid, data] of Object.entries(store)) {
      let rows = 0,
        need = 0,
        fixed = 0;
      for (const b of data.blocks) {
        let prev: number | null = null;
        for (const tx of b.rows) {
          if (tx.is_note) {
            if (tx.balance != null) prev = tx.balance;
            continue;
          }
          rows += 1;
          // Tính lại NG theo dữ liệu hiện tại, không dùng status đã đóng băng
          if (tx.balance != null) {
            if (prev != null) {
              const want = prev - (tx.amount_out ?? 0) + (tx.amount_in ?? 0);
              if (want !== tx.balance) need += 1;
            }
            prev = tx.balance;
          } else if (tx.status === "check") {
            need += 1;
          }
          if (tx.status === "fixed") fixed += 1;
        }
      }
      if (rows > 0) out[sid] = { sheet_id: sid, rows, need_check: need, fixed };
    }
    return out;
  }, [store]);

  // Xem ảnh nào thì hỏi backend luôn "có cần chỉnh gì không". Chạy bằng thuật
  // toán nên không tốn phí; sha256 vào deps để ảnh đổi là tính lại.
  useEffect(() => {
    if (!ws || !activeSheet) {
      setAutofix(null);
      return;
    }
    let alive = true;
    autofixPlan(ws.id, activeSheet.id)
      .then((p) => alive && setAutofix(p))
      .catch(() => alive && setAutofix(null));
    return () => {
      alive = false;
    };
  }, [ws?.id, activeSheet?.id, activeSheet?.sha256]);


  // Phím tắt: Ctrl+Z / Ctrl+Shift+Z cho bảng, n/p nhảy dòng cần soát.
  // n/p bị bỏ qua khi đang gõ trong ô, nếu không sẽ không đánh được chữ "n".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoEdit();
        else undoEdit();
        return;
      }
      // Ctrl+Y = làm lại (thói quen Windows, song song với Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoEdit();
        return;
      }
      if (typing) return;

      // Ctrl+A: chọn tất cả MẶT SỔ thay vì bôi đen cả trang
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setTicked(new Set(sheets.map((s) => s.id)));
        return;
      }
      // Bỏ chọn: dùng Escape đơn thuần. KHÔNG dùng Ctrl+Esc — trên Windows đó
      // là phím mở Start menu, trình duyệt không nhận được.
      if (e.key === "Escape") {
        setTicked(new Set());
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        jumpBad(1);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        jumpBad(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Chạy một thao tác đổi workspace. Trả về true nếu thành công. */
  const guard = async (fn: () => Promise<Workspace>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      const w = await fn();
      setWs(w);
      if (w.results) setStore(w.results);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const upload = useCallback(
    async (files: File[]) => {
      if (!ws) return;
      const ok = files.filter((f) => /\.(jpe?g|png|webp|pdf)$/i.test(f.name));
      if (ok.length === 0) return;
      setBusy(true);
      setErr(null);
      try {
        const next = await addSheets(ws.id, ok);
        setWs(next);
        if (next.added.length) {
          setActive(next.added[0]);
          setTicked((prev) => new Set([...prev, ...next.added]));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [ws],
  );

  const toggle = (id: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastTicked(id);
  };

  /** Shift+tick: tick cả dải từ lần tick trước tới đây. */
  const toggleRange = (id: string) => {
    const ids = sheets.map((s) => s.id);
    const a = lastTicked ? ids.indexOf(lastTicked) : -1;
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) return toggle(id);
    const [from, to] = a < b ? [a, b] : [b, a];
    setTicked((prev) => new Set([...prev, ...ids.slice(from, to + 1)]));
    setLastTicked(id);
  };

  const allTicked = sheets.length > 0 && ticked.size === sheets.length;
  const tickedIds = () => sheets.filter((s) => ticked.has(s.id)).map((s) => s.id);


  /** Các dòng của mặt đang xem, kèm trạng thái NG tính lại tại chỗ.
   *
   * Dùng cho phím n/p. Tính NG ở đây (không dùng `status` đã đóng băng) để sau
   * khi người dùng sửa một ô thì phím n không còn dẫn về dòng đã xong.
   */
  const flatRows = useMemo(() => {
    if (!active) return [];
    const data = store[active];
    if (!data) return [];
    const out: { ref: TxRef; bad: boolean; field: "balance" | "description" }[] = [];
    data.blocks.forEach((b, bi) => {
      let prev: number | null = null;
      b.rows.forEach((tx, ri) => {
        let bad = false;
        let field: "balance" | "description" = "balance";
        if (tx.balance != null) {
          if (prev != null) {
            const want = prev - (tx.amount_out ?? 0) + (tx.amount_in ?? 0);
            bad = want !== tx.balance;
          }
          prev = tx.balance;
        } else if (tx.status === "check") {
          bad = true;
          field = "description";
        }
        out.push({ ref: { sheet: active, block: bi, row: ri }, bad, field });
      });
    });
    return out;
  }, [active, store]);

  const badCount = flatRows.filter((r) => r.bad).length;

  /* Đặt con trỏ vào ô gây lệch — SAU khi React đã vẽ dòng mới.
     Không dùng requestAnimationFrame trong hàm xử lý: nó có thể chạy trước khi
     React commit, lúc đó chưa tìm được ô. */
  useEffect(() => {
    if (!pendingFocus) return;
    const { ref, field } = pendingFocus;
    const tr = document.querySelector<HTMLElement>(
      `[data-row="${ref.sheet}:${ref.block}:${ref.row}"]`,
    );
    tr?.scrollIntoView({ block: "nearest" });
    const inputs = tr?.querySelectorAll<HTMLInputElement>("input");
    // thứ tự ô trong hàng: ngày, [区分], 摘要, 出金, 入金, 残高, ...
    const idx = field === "balance" ? (cols.kind ? 5 : 4) : cols.kind ? 2 : 1;
    const el = inputs?.[idx];
    el?.focus();
    el?.select();
    setPendingFocus(null);
  }, [pendingFocus, cols.kind]);

  // Dải ảnh của từng dòng, để khoanh dòng đang chọn lên ảnh. Chạy bằng thuật
  // toán trên ảnh có sẵn nên $0.
  useEffect(() => {
    const rows = flatRows.length;
    if (!ws || !activeSheet || rows === 0) {
      setBands(null);
      return;
    }
    let alive = true;
    rowMap(ws.id, activeSheet.id, rows)
      .then((b) => alive && setBands(b))
      .catch(() => alive && setBands(null));
    return () => {
      alive = false;
    };
  }, [ws?.id, activeSheet?.id, activeSheet?.sha256, flatRows.length]);


  /** Nhảy tới dòng cần soát kế tiếp và ĐẶT CON TRỎ vào chính ô gây lệch.
   *
   * Chỉ cuộn tới thì màu vàng đã làm được rồi; giá trị nằm ở chỗ gõ được ngay
   * mà không phải với chuột tìm đúng ô.
   */
  const jumpBad = (dir: 1 | -1) => {
    if (flatRows.length === 0) return;
    const cur = selRow
      ? flatRows.findIndex(
          (r) =>
            r.ref.sheet === selRow.sheet &&
            r.ref.block === selRow.block &&
            r.ref.row === selRow.row,
        )
      : -1;
    for (let k = 1; k <= flatRows.length; k++) {
      const i =
        (cur + dir * k + flatRows.length * 2) % flatRows.length;
      if (!flatRows[i].bad) continue;
      const { ref, field } = flatRows[i];
      setSelRow(ref);
      setPendingFocus({ ref, field });   // effect bên dưới sẽ focus sau khi vẽ
      return;
    }
  };

  /** Chỉnh ảnh CHỈ tác động mặt đang xem. */
  const editTarget = () => (active ? [active] : []);

  const runScan = async (ids: string[]) => {
    if (!ws || ids.length === 0) return;

    setScanning(true);
    setErr(null);
    setProgress(null);
    setStates(Object.fromEntries(ids.map((id) => [id, "wait" as ScanState])));

    try {
      const job = await startScan(ws.id, ids);

      stopSse.current = listenEvents(
        job.id,
        (e) => {
          setProgress(e);
          if (e.stage === "page" && e.index) {
            const cur = ids[e.index - 1];
            setStates((prev) => {
              const next = { ...prev };
              if (cur) next[cur] = "scanning";
              const before = ids[e.index! - 2];
              if (before && next[before] === "scanning") next[before] = "done";
              return next;
            });
          }
          if (e.stage === "skip") {
            setStates((prev) => {
              const k = Object.keys(prev).find((x) => prev[x] === "scanning");
              return k ? { ...prev, [k]: "skipped" } : prev;
            });
          }
          if (e.stage === "validate" || e.stage === "finished") {
            setStates((prev) => {
              const next = { ...prev };
              for (const k of Object.keys(next)) {
                if (next[k] === "scanning") next[k] = "done";
              }
              return next;
            });
          }
          if (e.stage === "error") setErr(e.message);
        },
        async () => {
          try {
            const done = await getJob(job.id);
            if (done.error) setErr(done.error);
            // Nạp lại từ backend: kho đã được lưu theo TỪNG mặt sổ nên kết quả
            // các mặt quét trước vẫn còn nguyên.
            const w = await getWorkspace(ws.id);
            setWs(w);
            setStore(w.results ?? {});
            // Quét xong mà khung phải trống thì người dùng tưởng thất bại →
            // tự mở mặt sổ đầu tiên vừa quét mà CÓ giao dịch
            const first = ids.find((id) => w.results?.[id]?.blocks?.length);
            if (first) setActive(first);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          }
          setScanning(false);
        },
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setScanning(false);
    }
  };

  /** Đổi một dòng trong kho. Mọi hàm sửa đều đi qua đây nên Ctrl+Z bao hết. */
  const patchRows = (
    sheetId: string,
    blockIndex: number,
    fn: (rows: Tx[]) => Tx[],
  ) => {
    const data = store[sheetId];
    if (!data) return;
    // Chụp trạng thái TRƯỚC khi đổi, NGOÀI hàm cập nhật: React gọi updater
    // hai lần ở chế độ phát triển, đặt setPast bên trong sẽ đẩy lịch sử gấp đôi
    // và một lần Ctrl+Z chỉ lùi được nửa bước.
    setPast((p) => [...p.slice(-49), store]);
    setFuture([]);
    const blocks = data.blocks.map((b, bi) =>
      bi === blockIndex ? { ...b, rows: fn(b.rows) } : b,
    );
    setStore({ ...store, [sheetId]: { ...data, blocks } });
  };

  const undoEdit = () =>
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [store, ...f.slice(0, 49)]);
      setStore(prev);
      return p.slice(0, -1);
    });

  const redoEdit = () =>
    setFuture((f) => {
      if (f.length === 0) return f;
      setPast((p) => [...p.slice(-49), store]);
      setStore(f[0]);
      return f.slice(1);
    });

  /** Sửa một ô — giữ tại client, xuất file lấy đúng bản đang thấy. */
  const editCell: EditFn = (ref, field, value) =>
    patchRows(ref.sheet, ref.block, (rows) =>
      rows.map((tx, i) => (i === ref.row ? ({ ...tx, [field]: value } as Tx) : tx)),
    );

  /** Xoá một dòng (có hỏi lại) — dùng khi model đọc thừa một dòng. */
  const deleteRow: RowActionFn = (ref) =>
    setConfirm({
      title: t.confirmDeleteRowTitle,
      message: t.confirmDeleteRowMsg,
      label: t.deleteRow,
      danger: true,
      run: () =>
        patchRows(ref.sheet, ref.block, (rows) => rows.filter((_, i) => i !== ref.row)),
    });

  /** Thêm dòng trống — dùng khi máy bỏ sót dòng (chuỗi số dư không bắt được). */
  const addRow = (ref: TxRef) =>
    patchRows(ref.sheet, ref.block, (rows) => [
      ...rows,
      {
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
        sheet_id: ref.sheet,
      },
    ]);

  /** Suy số dư còn trống từ chuỗi: trước − rút + gửi. Không sửa ô đã có số. */
  const autoBalance = (sheetId: string, blockIndex: number) =>
    patchRows(sheetId, blockIndex, (rows) => {
      let running: number | null = null;
      return rows.map((tx) => {
        if (tx.balance != null) {
          running = tx.balance;
          return tx;
        }
        if (running == null || tx.is_note) return tx;
        running = running - (tx.amount_out ?? 0) + (tx.amount_in ?? 0);
        return { ...tx, balance: running };
      });
    });

  const doExport = async (o: ExportOpts) => {
    if (!ws || Object.keys(store).length === 0) return;
    setExporting(true);
    setErr(null);
    try {
      const scopeIds =
        o.scope === "all"
          ? undefined
          : o.scope === "ticked"
            ? tickedIds()
            : active
              ? [active]
              : undefined;

      const { blob, filename } = await exportFile(ws.id, {
        format: o.format,
        structure: o.structure,
        add_total: o.add_total,
        name: o.name || "tsucho",
        sheet_ids: scopeIds,
        accounts: buildAccounts(sheets, store),
      });
      saveBlob(blob, filename);
      setShowExport(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      {err && (
        <p className="flex items-start gap-2 border-b border-danger bg-danger/10 px-4 py-2 text-[13px] text-danger">
          <span>{err}</span>
          <button
            onClick={() => setErr(null)}
            className="ml-auto flex-none text-[15px] leading-none hover:opacity-70"
            aria-label={t.cancel}
          >
            ×
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ── Cột trái: kéo thả + danh sách mặt sổ ───────────── */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-b border-rule bg-card lg:border-b-0 lg:border-r">
          <DropZone busy={busy} onFiles={(f) => void upload(f)} />

          {/* Sổ mẫu: chạy hết luồng mà KHÔNG gọi model — cho người khác bấm thử
              mà không tốn lượt gọi và không cần đưa sổ thật lên. */}
          {sheets.length === 0 && (
            <div className="px-3 pb-3">
              <button
                onClick={() => {
                  if (!ws) return;
                  void (async () => {
                    setBusy(true);
                    try {
                      const w = await addSample(ws.id);
                      setWs(w);
                      setStore(w.results ?? {});
                      if (w.added[0]) setActive(w.added[0]);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                disabled={busy}
                className="w-full rounded-lg border border-dashed border-accent bg-accentpale/40 px-3 py-2 text-[12.5px] font-semibold text-accent hover:bg-accentpale disabled:opacity-50"
              >
                ✨ {t.trySample}
                <span className="mt-0.5 block text-[10.5px] font-normal text-ink3">
                  {t.trySampleHint}
                </span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 border-y border-rule bg-card2 px-3 py-2">
            <Tick
              on={allTicked}
              title={t.selectAll}
              onClick={() =>
                setTicked(allTicked ? new Set() : new Set(sheets.map((s) => s.id)))
              }
            />
            <span className="tnum text-[12px] font-semibold">
              {t.chosen(ticked.size)}
            </span>
            <span className="flex-1" />
            {ticked.size > 0 && (
              <button
                onClick={() => {
                  const ids = tickedIds();
                  if (!ws || ids.length === 0) return;
                  const withResult = ids.filter((id) => store[id]?.blocks?.length).length;
                  setConfirm({
                    title: t.confirmDeleteManyTitle,
                    message: t.confirmDeleteManyMsg(ids.length),
                    warning:
                      withResult > 0 ? t.confirmDeleteManyHasResult(withResult) : undefined,
                    label: t.deleteSheet,
                    danger: true,
                    run: () => {
                      setTicked(new Set());
                      if (active && ids.includes(active)) setActive(null);
                      void (async () => {
                        for (const id of ids) await guard(() => deleteSheet(ws.id, id));
                      })();
                    },
                  });
                }}
                title={t.remove}
                className="rounded-md p-1 text-ink3 hover:bg-danger/10 hover:text-danger"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
                </svg>
              </button>
            )}
            <button
              onClick={() => void runScan(tickedIds())}
              disabled={scanning || ticked.size === 0}
              className="flex items-center gap-1 rounded-lg border border-accent bg-accent px-2.5 py-1 text-[12px] font-semibold text-accentink hover:brightness-110 disabled:opacity-40"
            >
              {scanning ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6 4l14 8-14 8z" />
                </svg>
              )}
              {scanning
                ? progress?.index
                  ? `${progress.index}/${progress.total}`
                  : t.scanning
                : t.scanN(ticked.size)}
            </button>
          </div>

          <div className="thin-scroll min-h-0 flex-1 overflow-auto">
            <SheetRail
              wsId={ws?.id ?? ""}
              sheets={sheets}
              selected={ticked}
              active={active}
              states={states}
              perSheet={perSheet}
              onToggle={toggle}
              onToggleRange={toggleRange}
              onActivate={setActive}
              onRename={(id, name) =>
                ws && void guard(() => renameSheet(ws.id, id, name))
              }
              onReorder={(ids) => ws && void guard(() => reorderSheets(ws.id, ids))}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-rule bg-card2 px-3 py-1.5 text-[10.5px] text-ink3">
            <span className="tnum">{t.totalSheets(sheets.length)}</span>
            <span className="flex-1" />
            <span>{t.shiftHint}</span>
          </div>
        </aside>

        {/* ── Khung giữa: chỉnh ảnh ──────────────────────────── */}
        <section className="min-h-0 border-b border-rule bg-card lg:border-b-0 lg:border-r">
          <SheetViewer
            wsId={ws?.id ?? ""}
            sheet={activeSheet}
            busy={busy}
            scanning={scanning}
            onRotate={(deg) =>
              ws && active && void guard(() => rotateSheets(ws.id, editTarget(), deg))
            }
            onAdjust={async (a) =>
              !!ws && !!active && (await guard(() => adjustSheets(ws.id, editTarget(), a)))
            }
            onCrop={(box) =>
              ws && active && void guard(() => cropSheet(ws.id, editTarget(), box))
            }
            onReset={() => {
              if (!ws || !active) return;
              setConfirm({
                title: t.confirmResetTitle,
                message: t.confirmResetMsg,
                label: t.resetImage,
                run: () => void guard(() => resetSheets(ws.id, editTarget())),
              });
            }}
            onUndo={() =>
              ws && active && void guard(() => undoSheet(ws.id, editTarget()))
            }
            onScanThis={() => active && void runScan([active])}
            onDelete={() => {
              if (!ws || !active) return;
              const hasResult = !!store[active]?.blocks?.length;
              setConfirm({
                title: t.confirmDeleteSheetTitle,
                message: t.confirmDeleteSheetMsg(activeSheet?.name ?? ""),
                warning: hasResult ? t.confirmDeleteSheetHasResult : undefined,
                label: t.deleteSheet,
                danger: true,
                run: () => {
                  setActive(null);
                  setTicked((p) => {
                    const n = new Set(p);
                    n.delete(active);
                    return n;
                  });
                  void guard(() => deleteSheet(ws.id, active));
                },
              });
            }}
            autofix={autofix}
            highlight={highlight}
            highlightExact={!!bands?.exact}
            stale={!!active && !!store[active]?.blocks?.length && !activeSheet?.scanned}
            onAutofix={() => {
              if (!ws || !active || !autofix?.steps.length) return;
              void guard(() => autofixApply(ws.id, active, autofix.steps));
            }}
            onSplit={(x) => {
              if (!ws || !active) return;
              setConfirm({
                title: t.confirmSplitTitle,
                message: t.confirmSplitMsg,
                label: t.splitTwo,
                run: () => void guard(() => splitSheet(ws.id, active, x)),
              });
            }}
          />
        </section>

        {/* ── Cột phải: kết quả ──────────────────────────────── */}
        <section className="flex min-h-0 flex-col bg-page">
          {Object.keys(store).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-rule bg-card px-3 py-1.5">
              <button
                onClick={undoEdit}
                disabled={past.length === 0}
                title={`${t.undoEditLabel} (Ctrl+Z)`}
                className="rounded-md border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-35"
              >
                ↶ {t.undoEditLabel}
                {past.length > 0 && <span className="tnum ml-1 text-ink3">{past.length}</span>}
              </button>
              <button
                onClick={redoEdit}
                disabled={future.length === 0}
                title={`${t.redoEditLabel} (Ctrl+Y)`}
                className="rounded-md border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-35"
              >
                ↷ {t.redoEditLabel}
              </button>

              <span className="mx-1 h-4 w-px bg-rule" />

              <button
                onClick={() => jumpBad(1)}
                disabled={badCount === 0}
                title={t.nextBadHint}
                className="rounded-md border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-35"
              >
                {t.nextBad} <kbd className="ml-0.5 rounded border border-rule px-1 text-[10px]">n</kbd>
              </button>
              <span
                className={`tnum rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${
                  badCount > 0
                    ? "bg-warnbg text-warnink"
                    : "bg-okbg text-okink"
                }`}
              >
                {badCount > 0 ? t.badLeft(badCount) : t.allChecked}
              </span>
              <span className="flex-1" />
              {highlight && (
                <span className="text-[10.5px] text-ink3">
                  {bands?.exact ? t.rowLinkExact : t.rowLinkEstimated}
                </span>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ReviewPane
              store={store}
              sheets={sheets}
              activeSheet={active}
              mode={mode}
              cols={cols}
              onToggleCol={(k) => setCols((p) => ({ ...p, [k]: !p[k] }))}
              onModeChange={setMode}
              onEdit={editCell}
              onDeleteRow={deleteRow}
              onAddRow={addRow}
              onAutoBalance={autoBalance}
              selected={selRow}
              onSelectRow={setSelRow}
            />
          </div>

          {/* Thanh xuất file */}
          <div className="flex flex-wrap items-center gap-2 border-t border-rule bg-card px-3 py-2">
            <input
              value={ws?.book_name ?? ""}
              onChange={(e) =>
                setWs((p) => (p ? { ...p, book_name: e.target.value } : p))
              }
              onBlur={(e) => ws && void renameBook(ws.id, e.target.value)}
              placeholder={t.bookNamePlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[13px] placeholder:text-ink3"
            />
            <button
              onClick={() => setShowExport(true)}
              disabled={Object.keys(store).length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-4 py-1.5 text-[13.5px] font-semibold text-accentink hover:brightness-110 disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v11m0 0-4-4m4 4 4-4" />
                <path d="M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17" />
              </svg>
              {t.exportBtn}
            </button>
          </div>
        </section>
      </div>

      {/* Giới hạn công cụ — không bao giờ giấu (WEB_PLAN §7.4-5) */}
      <p className="flex items-start gap-2 border-t border-rule bg-card px-4 py-1.5 text-[11.5px] text-ink2">
        <span className="font-bold text-accent">!</span>
        {t.caveat}
      </p>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        warning={confirm?.warning}
        confirmLabel={confirm?.label ?? ""}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      />

      <ExportDialog
        open={showExport}
        bookName={ws?.book_name ?? ""}
        tickedCount={ticked.size}
        totalCount={Object.keys(store).length || sheets.length}
        hasCurrent={!!active}
        busy={exporting}
        onCancel={() => setShowExport(false)}
        onExport={doExport}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/15 backdrop-blur-[1px]">
          <p className="rounded-xl border-2 border-dashed border-accent bg-card px-8 py-6 text-lg font-semibold text-accent">
            {t.dropActive}
          </p>
        </div>
      )}
    </div>
  );
}
