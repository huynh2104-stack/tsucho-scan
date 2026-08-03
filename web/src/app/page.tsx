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

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addSample,
  addSheets,
  adjustSheets,
  buildAccounts,
  createWorkspace,
  cropSheet,
  deleteSheet,
  exportFile,
  getJob,
  getWorkspace,
  listWorkspaces,
  listenEvents,
  renameBook,
  renameSheet,
  reorderSheets,
  resetSheets,
  rotateSheets,
  rowMap,
  saveBlob,
  saveSheetResult,
  startScan,
  undoSheet,
  warpSheet,
  type PerSheet,
  type ResultStore,
  type RowBands,
  type ScanEvent,
  type Tx,
  type Workspace,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

/** Lỗi đang hiện trên thanh đỏ — giữ MÃ chứ không giữ câu đã dịch. */
type ErrInfo = {
  code?: string;
  sheet?: string;
  info?: { size_mb?: number; limit_mb?: number };
  text: string;
} | null;

/** Thanh đỏ tự tắt sau ngần này — đủ đọc một câu, không đọng lại cả buổi.
 *  Thông tin không mất: thẻ mặt sổ vẫn giữ huy hiệu「Không quét được」. */
const ERR_MS = 20000;

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

  /** Mã lỗi từ server → câu ĐÚNG THỨ TIẾNG người dùng đang xem.
   *
   * Server không biết giao diện đang để tiếng gì nên chỉ gửi mã; câu tiếng Việt
   * nó gửi kèm chỉ là dự phòng cho mã lạ. Trước đây web hiện thẳng câu của
   * server nên chuyển sang tiếng Nhật/Anh vẫn thấy tiếng Việt.
   */
  const errText = useCallback((e: NonNullable<ErrInfo>) => {
    const name = e.sheet ?? "";
    if (e.code === "not_bankbook") return t.errNotBankbook(name);
    if (e.code === "unreadable") return t.errUnreadable(name);
    if (e.code === "no_rows") return t.errNoRows(name);
    if (e.code === "too_large") {
      return t.errTooLarge(name, e.info?.size_mb ?? 0, e.info?.limit_mb ?? 0);
    }
    return e.text;
  }, [t]);
  const { user, ready } = useAuth();
  const router = useRouter();

  const [ws, setWs] = useState<Workspace | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [lastTicked, setLastTicked] = useState<string | null>(null);

  // KHO kết quả theo TỪNG mặt sổ. Trước đây giữ một ScanPayload duy nhất nên
  // quét mặt mới là ghi đè, làm mất kết quả các mặt đã quét — chính là bug cũ.
  /* past / present / future nằm TRONG MỘT state.
     Tách ra ba state riêng thì mỗi hàm phải đọc state kia qua closure — và
     closure đó là bản CŨ, nên bấm Ctrl+Y liên tiếp bị thiếu mất một bước.
     Gộp lại thì mỗi lần cập nhật nhìn thấy toàn bộ lịch sử đúng tại thời điểm đó. */
  const [hist, setHist] = useState<{
    past: ResultStore[];
    present: ResultStore;
    future: ResultStore[];
  }>({ past: [], present: {}, future: [] });
  const store = hist.present;
  const [states, setStates] = useState<Record<string, ScanState>>({});


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
  /* Lỗi giữ ở dạng CÓ CẤU TRÚC (mã + tên mặt sổ), không giữ câu đã dịch sẵn.
     Giữ câu dịch sẵn thì đổi ngôn ngữ giữa chừng, dòng đỏ vẫn nằm nguyên tiếng
     cũ — chính là lỗi người dùng báo. Câu chữ được dựng lúc VẼ, nên đổi ngôn
     ngữ là nó đổi theo ngay. */
  const [err, setErr] = useState<ErrInfo>(null);
  const [dragging, setDragging] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* Điện thoại không đủ chỗ cho 3 khung cạnh nhau; xếp chồng thì mỗi khung
     còn 1/3 màn hình, không dùng được. Nên dưới `lg` chỉ hiện MỘT khung, đổi
     bằng 3 thẻ ở dưới cùng. Từ `lg` trở lên vẫn là 3 khung như cũ. */
  const [pane, setPane] = useState<"list" | "image" | "result">("list");

  const [mode, setMode] = useState<ViewMode>("page");
  const [cols, setCols] = useState<OptCols>({ store: true, extra: false, kind: true });

  const stopSse = useRef<(() => void) | null>(null);
  const booted = useRef<string | null>(null);   // đã mở workspace cho user nào

  /* ── Autosave công soát ──────────────────────────────────────────────
     `savedRef` giữ ĐÚNG object của từng mặt sổ mà server đang có. Mọi hàm sửa
     đều tạo object mới cho riêng mặt bị đụng tới, nên chỉ cần so sánh tham
     chiếu (===) là biết mặt nào đã đổi — không phải so từng ô. */
  const savedRef = useRef<ResultStore>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  /* Thanh đỏ tự tắt sau 20 giây. Người dùng phàn nàn nó nằm lì cả buổi.
     Không sợ mất thông tin: thẻ mặt sổ bên trái vẫn giữ huy hiệu「Không quét
     được」cho tới khi quét lại, nên quay lại sau vẫn biết mặt nào hỏng. */
  useEffect(() => {
    if (!err) return;
    const id = setTimeout(() => setErr(null), ERR_MS);
    return () => clearTimeout(id);
  }, [err]);

  // Chưa đăng nhập thì không có gì để xem — đá về trang đăng nhập.
  // Chờ `ready` mới xét, không thì mỗi lần F5 lại chớp qua /login một nhịp.
  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  // Mở lại không gian làm việc cũ — F5 không mất ảnh đã tải lên
  useEffect(() => {
    if (!user) return;
    // Effect này chạy hai lần ở chế độ phát triển (React StrictMode). Không
    // chặn thì tài khoản mới toanh bị tạo hai không gian làm việc rỗng.
    if (booted.current === user.id) return;
    booted.current = user.id;

    // Khoá theo user.id: hai tài khoản dùng chung một máy không giành nhau
    const key = `${WS_KEY}.${user.id}`;
    (async () => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const w = await getWorkspace(saved);
          setWs(w);
          syncStore(w.results ?? {});     // kết quả đã quét sống qua F5
          return;
        } catch {
          localStorage.removeItem(key);
        }
      }
      try {
        // Hỏi server trước khi tạo mới: xoá bộ nhớ trình duyệt hay đổi máy vẫn
        // mở lại đúng việc đang làm dở, không đẻ ra một loạt workspace rỗng.
        const { workspaces } = await listWorkspaces();
        const w = workspaces.length
          ? await getWorkspace(workspaces[0].id)
          : await createWorkspace();
        localStorage.setItem(key, w.id);
        setWs(w);
        syncStore(w.results ?? {});
      } catch (e) {
        setErr({ text: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => stopSse.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  /* Lưới an toàn cho lớp phủ kéo-thả: mọi nhánh con đều có thể gọi
     stopPropagation (thẻ mặt sổ làm vậy để trang không xử lý lại), nên onDrop
     của trang không chắc chạy. Nghe ở mức CỬA SỔ thì luôn tắt được lớp phủ. */
  useEffect(() => {
    const clear = () => setDragging(false);
    window.addEventListener("drop", clear);
    window.addEventListener("dragend", clear);
    // Chuột rời hẳn cửa sổ khi đang kéo cũng phải tắt
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) clear();
    };
    window.addEventListener("dragleave", leave);
    return () => {
      window.removeEventListener("drop", clear);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("dragleave", leave);
    };
  }, []);

  /** Chạy một thao tác đổi workspace. Trả về true nếu thành công. */
  const guard = async (fn: () => Promise<Workspace>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      const w = await fn();
      setWs(w);
      // GỘP: giữ nguyên các ô người dùng đã sửa ở những mặt sổ khác
      if (w.results) syncStore(w.results);
      return true;
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Tải file lên. `beforeId` = chèn NGAY TRƯỚC mặt sổ đó (thả vào giữa danh sách). */
  const upload = useCallback(
    async (files: File[], beforeId?: string) => {
      if (!ws) return;
      const ok = files.filter((f) => /\.(jpe?g|png|webp|pdf)$/i.test(f.name));
      if (ok.length === 0) return;
      setBusy(true);
      setErr(null);
      try {
        const created = await addSheets(ws.id, ok);
        const added = created.added;
        let next: Workspace = created;

        // File mới luôn được thêm vào CUỐI; nếu người dùng thả vào giữa danh
        // sách thì sắp lại cho đúng chỗ họ nhắm tới.
        if (beforeId && added.length) {
          const rest = created.sheets
            .map((sh) => sh.id)
            .filter((id) => !added.includes(id));
          const at = rest.indexOf(beforeId);
          if (at >= 0) {
            rest.splice(at, 0, ...added);
            next = await reorderSheets(ws.id, rest);
          }
        }

        setWs(next);
        if (next.results) syncStore(next.results);
        if (added.length) {
          setActive(added[0]);
          setTicked((prev) => new Set([...prev, ...added]));
        }
      } catch (e) {
        setErr({ text: e instanceof Error ? e.message : String(e) });
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
          if (e.stage === "error") {
            setErr({ code: e.code, sheet: e.sheet, info: e.info, text: e.message });
            // Quét hỏng thì phải GỠ chữ "Đang quét" — trước đây nó nằm lại
            // vĩnh viễn trên thẻ mặt sổ, người dùng tưởng máy vẫn đang chạy.
            setStates((prev) => {
              const next = { ...prev };
              for (const k of Object.keys(next)) {
                if (next[k] === "scanning" || next[k] === "wait") next[k] = "failed";
              }
              return next;
            });
          }
        },
        async () => {
          try {
            const done = await getJob(job.id);
            if (done.error) {
              setErr({
                code: done.error_code,
                sheet: done.error_sheet,
                info: done.error_info,
                text: done.error,
              });
            }
            // Nạp lại từ backend: kho đã được lưu theo TỪNG mặt sổ nên kết quả
            // các mặt quét trước vẫn còn nguyên.
            const w = await getWorkspace(ws.id);
            setWs(w);
            // Chỉ những mặt VỪA QUÉT mới lấy bản mới; các mặt khác giữ nguyên
            // bản người dùng đang sửa dở.
            syncStore(w.results ?? {}, ids);
            // Quét xong mà khung phải trống thì người dùng tưởng thất bại →
            // tự mở mặt sổ đầu tiên vừa quét mà CÓ giao dịch
            const first = ids.find((id) => w.results?.[id]?.blocks?.length);
            if (first) setActive(first);
          } catch (e) {
            setErr({ text: e instanceof Error ? e.message : String(e) });
          }
          setScanning(false);
        },
      );
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : String(e) });
      setScanning(false);
    }
  };

  /** Đổi một dòng trong kho. Mọi hàm sửa đều đi qua đây nên Ctrl+Z bao hết. */
  const patchRows = (
    sheetId: string,
    blockIndex: number,
    fn: (rows: Tx[]) => Tx[],
  ) => {
    commitStore((prev) => {
      const data = prev[sheetId];
      if (!data) return prev;
      const blocks = data.blocks.map((b, bi) =>
        bi === blockIndex ? { ...b, rows: fn(b.rows) } : b,
      );
      return { ...prev, [sheetId]: { ...data, blocks } };
    });
  };

  const undoEdit = () =>
    setHist((h) =>
      h.past.length === 0
        ? h
        : {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future.slice(0, 49)],
          },
    );

  const redoEdit = () =>
    setHist((h) =>
      h.future.length === 0
        ? h
        : {
            past: [...h.past.slice(-49), h.present],
            present: h.future[0],
            future: h.future.slice(1),
          },
    );

  /** Thay kho do NGƯỜI DÙNG sửa → có vào lịch sử Ctrl+Z. */
  const commitStore = (next: (prev: ResultStore) => ResultStore) =>
    setHist((h) => ({
      past: [...h.past.slice(-49), h.present],
      present: next(h.present),
      future: [],
    }));

  /** Đồng bộ kết quả từ server. GỘP chứ không ghi đè, và KHÔNG vào lịch sử.
   *
   * Ghi đè cả kho là nguyên nhân làm mất các ô người dùng đã sửa ở mặt sổ khác
   * mỗi khi quét thêm file, xoá file hay đổi thứ tự. Chỉ những mặt vừa được
   * quét lại (`replace`) mới lấy bản mới từ server.
   */
  const syncStore = (fromServer: ResultStore, replace: string[] = []) =>
    setHist((h) => {
      const merged: ResultStore = { ...fromServer };
      for (const [sid, local] of Object.entries(h.present)) {
        if (!replace.includes(sid) && fromServer[sid]) merged[sid] = local;
      }
      // Mặt sổ đã bị xoá ở server thì cũng bỏ khỏi kho
      for (const sid of Object.keys(merged)) {
        if (!fromServer[sid]) delete merged[sid];
      }

      /* Mặt nào vừa lấy từ server thì coi như đã lưu, mặt nào giữ bản sửa tại
         chỗ thì vẫn còn nợ. Thiếu bước này, autosave sẽ gửi lại toàn bộ kho
         ngay sau mỗi lần quét. (Phép tính chỉ dựa trên dữ liệu đầu vào nên
         chạy hai lần cũng ra cùng kết quả — an toàn với StrictMode.) */
      const known: ResultStore = {};
      for (const sid of Object.keys(merged)) {
        const fromSrv = merged[sid] === fromServer[sid];
        const prev = savedRef.current[sid];
        if (fromSrv) known[sid] = merged[sid];
        else if (prev) known[sid] = prev;
      }
      savedRef.current = known;

      return { ...h, present: merged };
    });

  /** Đẩy các mặt sổ đã sửa lên server. Gọi qua bộ đếm giờ ở effect bên dưới. */
  const flushSave = useCallback(async (wsId: string, snapshot: ResultStore) => {
    const dirty = Object.keys(snapshot).filter(
      (sid) => snapshot[sid] !== savedRef.current[sid],
    );
    if (dirty.length === 0) return;
    setSaveState("saving");
    try {
      for (const sid of dirty) {
        await saveSheetResult(wsId, sid, snapshot[sid].blocks);
        savedRef.current[sid] = snapshot[sid];
      }
      setSaveState("saved");
    } catch (e) {
      // Báo thẳng ra màn hình: im lặng nuốt lỗi ở đây chính là kiểu mất dữ
      // liệu mà autosave sinh ra để chống.
      setSaveState("error");
      setErr({ text: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  /* Chờ ~800ms sau nhịp gõ cuối mới ghi — gõ từng chữ mà mỗi chữ một request
     thì vừa nặng server vừa dễ ghi chồng lên nhau. */
  useEffect(() => {
    if (!ws) return;
    const dirty = Object.keys(store).some((sid) => store[sid] !== savedRef.current[sid]);
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(ws.id, store), 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [store, ws, flushSave]);

  /* Đóng tab lúc còn đang nợ thì hỏi lại. Chỉ hỏi khi thật sự chưa lưu xong,
     nên bình thường người dùng không bao giờ thấy hộp thoại này. */
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      const dirty = Object.keys(store).some(
        (sid) => store[sid] !== savedRef.current[sid],
      );
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [store]);

  /** Sửa một ô. Autosave ở trên sẽ đẩy lên server ngay sau đó. */
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

  /* Phím tắt toàn cục.
     Ctrl+Z hoàn tác bảng, Ctrl+Shift+Z / Ctrl+Y làm lại, n/p nhảy dòng cần
     soát, Ctrl+A chọn tất cả mặt sổ, Escape bỏ chọn.
     n/p bị bỏ qua khi đang gõ trong ô, nếu không sẽ không đánh được chữ "n". */
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
        setTicked(new Set(sheets.map((sh) => sh.id)));
        return;
      }
      // Bỏ chọn: Escape đơn. KHÔNG dùng Ctrl+Esc — trên Windows đó là phím mở
      // Start menu, trình duyệt không nhận được.
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
      setErr({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  // Chưa biết ai đang đăng nhập thì chưa vẽ bàn làm việc — nếu vẽ, người dùng
  // thấy giao diện rỗng loé lên một nhịp rồi mới bị đá sang /login.
  // (Đặt SAU mọi hook: React cấm số lượng hook thay đổi giữa các lần render.)
  if (!ready || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[14px] text-ink2">
        {t.authChecking}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        // CHỈ nhận khi đang kéo FILE từ máy. Kéo thẻ mặt sổ trong danh sách
        // cũng bắn dragover lên đây; trước kia nó bật lớp phủ "Thả ra để thêm",
        // rồi onDrop của thẻ gọi stopPropagation nên lớp phủ không bao giờ tắt
        // — màn hình kẹt luôn.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) {
          setDragging(false);
          return;
        }
        e.preventDefault();
        setDragging(false);
        void upload(Array.from(e.dataTransfer.files));
      }}
      // Lưới an toàn: kéo xong dù thả ở đâu cũng phải tắt lớp phủ
      onDragEnd={() => setDragging(false)}
    >
      {err && (
        <p className="flex items-start gap-2 border-b border-danger bg-danger/10 px-4 py-2 text-[13px] text-danger">
          {/* Dịch tại chỗ VẼ, không dịch lúc lưu → đổi ngôn ngữ là đổi ngay */}
          <span>{errText(err)}</span>
          <button
            onClick={() => setErr(null)}
            className="ml-auto flex-none text-[15px] leading-none hover:opacity-70"
            aria-label={t.cancel}
          >
            ×
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 lg:grid-cols-[272px_minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-1">
        {/* ── Cột trái: kéo thả + danh sách mặt sổ ───────────── */}
        <aside
          className={`min-h-0 flex-col overflow-hidden border-b border-rule bg-card lg:flex lg:border-b-0 lg:border-r ${
            pane === "list" ? "flex" : "hidden"
          }`}
        >
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
                      syncStore(w.results ?? {}, w.added);
                      if (w.added[0]) setActive(w.added[0]);
                    } catch (e) {
                      setErr({ text: e instanceof Error ? e.message : String(e) });
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
              onActivate={(id) => {
                setActive(id);
                // Trên điện thoại: chọn mặt sổ xong là muốn xem/chỉnh nó ngay,
                // không phải tự đi tìm thẻ「Chỉnh ảnh」. Máy rộng thì cả ba
                // khung cùng hiện nên dòng này không đổi gì.
                setPane("image");
              }}
              onRename={(id, name) =>
                ws && void guard(() => renameSheet(ws.id, id, name))
              }
              onReorder={(ids) => {
                setDragging(false);
                if (ws) void guard(() => reorderSheets(ws.id, ids));
              }}
              onDropFiles={(files, beforeId) => {
                // Thẻ mặt sổ gọi stopPropagation nên sự kiện KHÔNG lên tới
                // window — phải tự tắt lớp phủ ở đây, nếu không nó kẹt lại.
                setDragging(false);
                void upload(files, beforeId);
              }}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-rule bg-card2 px-3 py-1.5 text-[10.5px] text-ink3">
            <span className="tnum">{t.totalSheets(sheets.length)}</span>
            <span className="flex-1" />
            <span>{t.shiftHint}</span>
          </div>
        </aside>

        {/* ── Khung giữa: chỉnh ảnh ──────────────────────────── */}
        <section
          className={`min-h-0 border-b border-rule bg-card lg:block lg:border-b-0 lg:border-r ${
            pane === "image" ? "block" : "hidden"
          }`}
        >
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
            onWarp={(corners, mids) =>
              ws && active && void guard(() => warpSheet(ws.id, active, corners, mids))
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
            highlight={highlight}
            highlightExact={!!bands?.exact}
            highlightSkew={bands?.skew_deg ?? 0}
            stale={!!active && !!store[active]?.blocks?.length && !activeSheet?.scanned}
          />
        </section>

        {/* ── Cột phải: kết quả ──────────────────────────────── */}
        <section
          className={`min-h-0 flex-col bg-page lg:flex ${
            pane === "result" ? "flex" : "hidden"
          }`}
        >
          {Object.keys(store).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-rule bg-card px-3 py-1.5">
              <button
                onClick={undoEdit}
                disabled={hist.past.length === 0}
                title={`${t.undoEditLabel} (Ctrl+Z)`}
                className="rounded-md border border-rule px-2 py-1 text-[11.5px] text-ink2 hover:border-accentmid hover:text-ink disabled:opacity-35"
              >
                ↶ {t.undoEditLabel}
                {hist.past.length > 0 && (
                  <span className="tnum ml-1 text-ink3">{hist.past.length}</span>
                )}
              </button>
              <button
                onClick={redoEdit}
                disabled={hist.future.length === 0}
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
              {/* Trạng thái autosave — người dùng vừa mất công soát vì tưởng
                  đã lưu, nên từ giờ nói rõ ra. */}
              {saveState !== "idle" && (
                <span
                  className={`text-[10.5px] ${
                    saveState === "error" ? "font-semibold text-danger" : "text-ink3"
                  }`}
                >
                  {saveState === "saving"
                    ? t.saveSaving
                    : saveState === "saved"
                      ? `✓ ${t.saveSaved}`
                      : t.saveFailed}
                </span>
              )}
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

      {/* Ba thẻ chuyển khung — CHỈ trên màn hình hẹp (điện thoại, tablet dọc).
          Kèm số đếm để biết đang có bao nhiêu mặt sổ / bao nhiêu dòng kết quả
          mà không phải chuyển qua chuyển lại. */}
      <nav className="flex border-t border-rule bg-card lg:hidden">
        {(
          [
            { id: "list", label: t.paneSheets, n: sheets.length },
            { id: "image", label: t.paneImage, n: 0 },
            { id: "result", label: t.paneResult, n: Object.keys(store).length },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            onClick={() => setPane(p.id)}
            aria-current={pane === p.id}
            className={`flex flex-1 items-center justify-center gap-1.5 border-t-2 py-2.5 text-[13px] ${
              pane === p.id
                ? "border-accent font-semibold text-accent"
                : "border-transparent text-ink2"
            }`}
          >
            {p.label}
            {p.n > 0 && (
              <span className="tnum rounded bg-card3 px-1.5 text-[11px] text-ink3">
                {p.n}
              </span>
            )}
          </button>
        ))}
      </nav>

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
