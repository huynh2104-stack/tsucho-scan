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
  addSheets,
  adjustSheets,
  createWorkspace,
  cropSheet,
  deleteSheet,
  exportFile,
  getJob,
  getWorkspace,
  listenEvents,
  renameBook,
  resetSheets,
  rotateSheets,
  undoSheet,
  saveBlob,
  startScan,
  type Account,
  type PerSheet,
  type ScanEvent,
  type ScanPayload,
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
  type ViewMode,
} from "@/components/ReviewPane";
import ExportDialog, { type ExportOpts } from "@/components/ExportDialog";

const WS_KEY = "tsucho.ws";

export default function Workbench() {
  const { t } = useT();

  const [ws, setWs] = useState<Workspace | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [lastTicked, setLastTicked] = useState<string | null>(null);

  const [result, setResult] = useState<ScanPayload | null>(null);
  const [states, setStates] = useState<Record<string, ScanState>>({});
  const [jobId, setJobId] = useState<string | null>(null);
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
          setWs(await getWorkspace(saved));
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

  const perSheet: Record<string, PerSheet> = useMemo(
    () =>
      Object.fromEntries(
        (result?.per_sheet ?? []).filter((p) => p.rows > 0).map((p) => [p.sheet_id, p]),
      ),
    [result],
  );

  /** Chạy một thao tác đổi workspace. Trả về true nếu thành công. */
  const guard = async (fn: () => Promise<Workspace>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      setWs(await fn());
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
      setJobId(job.id);

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
            if (done.result) {
              setResult(done.result);
              // Quét xong mà khung phải trống thì người dùng tưởng thất bại →
              // tự mở mặt sổ đầu tiên CÓ giao dịch (bỏ qua trang bìa 0 dòng)
              const first = done.result.per_sheet.find((p) => p.rows > 0);
              if (first) setActive(first.sheet_id);
            }
            if (done.error) setErr(done.error);
            setWs(await getWorkspace(ws.id));
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

  /** Sửa một ô — giữ ngay tại client, xuất file lấy bản này. */
  const editCell: EditFn = (ref, field, value) => {
    setResult((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((acc, ai) =>
        ai !== ref.acc
          ? acc
          : {
              ...acc,
              transactions: acc.transactions.map((tx, ri) =>
                ri === ref.row ? ({ ...tx, [field]: value } as Tx) : tx,
              ),
            },
      );
      return { ...prev, accounts };
    });
  };

  /** Thêm một dòng trống — dùng khi máy bỏ sót dòng (lỗi chuỗi số dư không bắt được). */
  const addRow = (accIndex: number, sheetId: string | null) => {
    setResult((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((acc, ai) => {
        if (ai !== accIndex) return acc;
        const blank: Tx = {
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
        return { ...acc, transactions: [...acc.transactions, blank] };
      });
      return { ...prev, accounts };
    });
  };

  /** Suy số dư còn trống từ chuỗi: prev − rút + gửi. Không sửa ô đã có số. */
  const autoBalance = (accIndex: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((acc, ai) => {
        if (ai !== accIndex) return acc;
        let running: number | null = null;
        const transactions = acc.transactions.map((tx) => {
          if (tx.balance != null) {
            running = tx.balance;
            return tx;
          }
          if (running == null || tx.is_note) return tx;
          running = running - (tx.amount_out ?? 0) + (tx.amount_in ?? 0);
          return { ...tx, balance: running };
        });
        return { ...acc, transactions };
      });
      return { ...prev, accounts };
    });
  };

  const doExport = async (o: ExportOpts) => {
    if (!jobId || !result) return;
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

      const { blob, filename } = await exportFile(jobId, {
        format: o.format,
        structure: o.structure,
        add_total: o.add_total,
        name: o.name || "tsucho",
        sheet_ids: scopeIds,
        accounts: result.accounts as Account[],
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
                  setTicked(new Set());
                  if (active && ids.includes(active)) setActive(null);
                  if (ws) {
                    void (async () => {
                      for (const id of ids) await guard(() => deleteSheet(ws.id, id));
                    })();
                  }
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
            onReset={() =>
              ws && active && void guard(() => resetSheets(ws.id, editTarget()))
            }
            onUndo={() =>
              ws && active && void guard(() => undoSheet(ws.id, editTarget()))
            }
            onScanThis={() => active && void runScan([active])}
          />
        </section>

        {/* ── Cột phải: kết quả ──────────────────────────────── */}
        <section className="flex min-h-0 flex-col bg-page">
          <div className="min-h-0 flex-1">
            <ReviewPane
              result={result}
              sheets={sheets}
              activeSheet={active}
              mode={mode}
              cols={cols}
              onToggleCol={(k) => setCols((p) => ({ ...p, [k]: !p[k] }))}
              onModeChange={setMode}
              onEdit={editCell}
              onAddRow={addRow}
              onAutoBalance={autoBalance}
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
              disabled={!result || !jobId}
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

      <ExportDialog
        open={showExport}
        bookName={ws?.book_name ?? ""}
        tickedCount={ticked.size}
        totalCount={result?.sheet_ids.length ?? sheets.length}
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
