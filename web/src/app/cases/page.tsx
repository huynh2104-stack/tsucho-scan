"use client";

/**
 * Danh sách hồ sơ (task 2.2).
 *
 * Một hồ sơ = một khách hoặc một bộ sổ: ảnh, kết quả quét và file xuất của hồ sơ này không lẫn sang
 * hồ sơ khác. Trang này là chỗ chọn việc để làm: mở, tạo mới, đổi tên, lưu trữ (cất đi nhưng không mất)
 * và xoá hẳn (có cảnh báo, Enter không xác nhận được).
 *
 * Số liệu «còn N dòng» do MÁY CHỦ tính trên kết quả đã lưu bằng cùng định nghĩa «cần soát» với bàn làm việc
 * và file Excel — nên con số ở đây trùng với bộ đếm bên trong hồ sơ.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import DialogFrame from "@/components/ui/DialogFrame";
import { Archive, ArrowUUpLeft, MagnifyingGlass, PencilSimple, Plus, Trash } from "@/components/ui/icons";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  patchWorkspace,
  type WorkspaceBrief,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { caseKey } from "@/lib/case";
import { caseStatus, countByTab, visibleCases } from "@/lib/cases";
import { useT } from "@/lib/i18n";

const LOCALE = { vi: "vi-VN", en: "en-US", ja: "ja-JP" } as const;

/* Nút phụ của một dòng: 28px cho chuột, 40px cho ngón tay */
const ROW_ICON = "btn btn-ghost btn-sm btn-icon max-sm:h-10 max-sm:w-10";

export default function CasesPage() {
  const { t, lang } = useT();
  const { user, ready } = useAuth();
  const router = useRouter();

  const [list, setList] = useState<WorkspaceBrief[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [archivedTab, setArchivedTab] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);   // id hồ sơ đang đổi tên tại chỗ
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<WorkspaceBrief | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const newRef = useRef<HTMLInputElement>(null);
  // Esc khi đang đổi tên: bỏ, không lưu. Trình duyệt có thể bắn `blur` khi ô nhập bị gỡ đi, nên phải có cờ này.
  const skipRename = useRef(false);
  // Bấm tên có thể là cú đầu của bấm đúp đổi tên, nên phải chờ một nhịp rồi mới mở hồ sơ
  const openTimer = useRef<number | undefined>(undefined);
  // Bấm ra ngoài ô đổi tên chỉ để lưu tên: cú bấm đó không được mở hồ sơ. Đọc lúc nhấn chuột vì `blur` chạy trước `click`.
  const pressedWhileEditing = useRef(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!user) return;
    try {
      setCurrentId(localStorage.getItem(caseKey(user.id)));
    } catch {
      /* không đọc được thì chỉ mất nhãn «Đang mở» */
    }
    let con = true;
    listWorkspaces()
      .then((r) => con && setList(r.workspaces))
      .catch(() => con && setFailed(true));
    return () => {
      con = false;
    };
  }, [user]);

  useEffect(() => {
    if (creating) newRef.current?.focus();
  }, [creating]);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const shown = useMemo(() => visibleCases(list ?? [], query, archivedTab), [list, query, archivedTab]);
  const counts = useMemo(() => countByTab(list ?? []), [list]);

  const fmt = useCallback(
    (ts: number) =>
      new Date(ts * 1000).toLocaleString(LOCALE[lang], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [lang],
  );

  const patchLocal = (id: string, p: Partial<WorkspaceBrief>) =>
    setList((cur) => cur && cur.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const openNew = () => {
    setNewName("");
    setCreating(true);
  };

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const w = await createWorkspace(newName.trim());
      router.push(`/?ws=${w.id}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  /** Cả dòng là lối mở hồ sơ. Nút, liên kết và ô nhập trong dòng vẫn làm việc của chúng. */
  function rowClick(e: MouseEvent<HTMLTableRowElement>, c: WorkspaceBrief) {
    const el = e.target as HTMLElement;
    if (pressedWhileEditing.current || el.closest("a, button, input")) return;
    if (window.getSelection()?.toString()) return;              // đang bôi đen để sao chép tên
    const open = () => router.push(`/?ws=${c.id}`);
    if (!el.closest("[data-testid=case-name]")) return open();
    window.clearTimeout(openTimer.current);
    if (e.detail === 1) openTimer.current = window.setTimeout(open, 260);
  }

  function startRename(c: WorkspaceBrief) {
    window.clearTimeout(openTimer.current);
    skipRename.current = false;
    setDraft(c.book_name);
    setEditing(c.id);
  }

  async function commitRename(c: WorkspaceBrief) {
    setEditing(null);
    if (skipRename.current) return;
    const name = draft.trim();
    if (name === c.book_name) return;
    patchLocal(c.id, { book_name: name.slice(0, 80) });
    try {
      await patchWorkspace(c.id, { book_name: name });
    } catch {
      patchLocal(c.id, { book_name: c.book_name });             // máy chủ từ chối: trả về tên cũ
    }
  }

  async function toggleArchive(c: WorkspaceBrief) {
    const archived = !c.archived;
    patchLocal(c.id, { archived });
    try {
      await patchWorkspace(c.id, { archived });
    } catch {
      patchLocal(c.id, { archived: c.archived });
    }
  }

  async function remove(c: WorkspaceBrief) {
    setToDelete(null);
    try {
      await deleteWorkspace(c.id);
    } catch {
      setFailed(true);
      return;
    }
    setList((cur) => cur && cur.filter((x) => x.id !== c.id));
    if (user && currentId === c.id) {
      try {
        localStorage.removeItem(caseKey(user.id));
      } catch {
        /* như trên */
      }
      setCurrentId(null);
    }
  }

  if (!user) return null;

  const loading = list === null && !failed;
  const empty = list !== null && shown.length === 0;
  const firstRun = empty && !archivedTab && !query.trim();
  const headCell = "h-[calc(32px*var(--fs))] px-4 text-t12 font-bold whitespace-nowrap";

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-page">
      <div className="mx-auto flex w-full max-w-[1344px] flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="min-w-0 text-t22 font-bold">{t.casesTitle}</h1>
          <button type="button" data-testid="case-new" onClick={openNew} className="btn btn-primary flex-none max-sm:min-h-10">
            <Plus size={16} weight="bold" aria-hidden />
            {t.casesNew}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-rule">
          <div className="-mb-px flex gap-6" role="tablist" aria-label={t.casesTitle}>
            {([false, true] as const).map((arch) => (
              <button
                key={String(arch)}
                type="button"
                role="tab"
                aria-selected={archivedTab === arch}
                onClick={() => setArchivedTab(arch)}
                className={`flex h-[calc(40px*var(--fs))] cursor-pointer items-center gap-1.5 border-b-2 text-t14 font-bold transition-colors duration-100 ${
                  archivedTab === arch ? "border-accent text-ink" : "border-transparent text-ink2 hover:border-rule hover:text-ink"
                }`}
              >
                {arch ? t.casesTabArchived : t.casesTabActive}
                <span className="num font-normal text-ink3">{arch ? counts.archived : counts.active}</span>
              </button>
            ))}
          </div>
          <div className="relative mb-2 w-[280px] max-sm:w-full">
            <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.casesSearch}
              aria-label={t.casesSearch}
              className="field pl-8 max-sm:min-h-10"
            />
          </div>
        </div>

        {failed && (
          <p className="mt-4 rounded-[3px] bg-warnbg px-3 py-2 text-t13 font-bold text-warnink" role="alert">
            {t.casesLoadFail}
          </p>
        )}

        {empty && !failed && (
          <div className="py-10">
            {firstRun ? (
              <>
                <p className="text-t16 font-bold">{t.casesEmpty}</p>
                <p className="mt-2 max-w-[62ch] text-t14 leading-[1.75] text-ink2">{t.casesSubtitle}</p>
                <button type="button" onClick={openNew} className="btn btn-primary mt-5">
                  <Plus size={16} weight="bold" aria-hidden />
                  {t.casesNew}
                </button>
              </>
            ) : (
              <p className="text-t14 text-ink2">{query.trim() && (list?.length ?? 0) > 0 ? t.casesNoMatch : t.casesEmptyArchived}</p>
            )}
          </div>
        )}

        {(loading || shown.length > 0) && (
          <div className="mt-4">
            {/* Một bảng thật, kẻ thẳng trên nền trang như tờ biểu mẫu, không có khung thẻ; màn hẹp thì mỗi dòng tự xếp lại thành lưới, bốn cột số dồn xuống dưới tên */}
            <table className="w-full border-collapse max-sm:block">
              <thead className="max-sm:hidden">
                <tr className="bg-head text-headink">
                  <th scope="col" className={`${headCell} text-left`}>
                    {t.casesColName}
                  </th>
                  <th scope="col" className={`${headCell} text-right`}>
                    {t.casesColSheets}
                  </th>
                  <th scope="col" className={`${headCell} text-right`}>
                    {t.casesColRows}
                  </th>
                  {/* Bề rộng tối thiểu: đổi tab hay lúc dữ liệu về thì cột không xê dịch */}
                  <th scope="col" className={`${headCell} text-left`}>
                    <span className="inline-block min-w-[calc(104px*var(--fs))]">{t.casesColStatus}</span>
                  </th>
                  <th scope="col" className={`${headCell} text-left`}>
                    <span className="inline-block min-w-[calc(132px*var(--fs))]">{t.casesColUpdated}</span>
                  </th>
                  <td>
                    <span className="block w-[calc(148px*var(--fs))]" />
                  </td>
                </tr>
              </thead>
              <tbody className="max-sm:block">
                {loading &&
                  [0, 1, 2].map((i) => (
                    <tr key={i} className="border-b border-rule max-sm:block">
                      <td className="h-[calc(52px*var(--fs))] w-full max-w-0 px-4 max-sm:block max-sm:h-auto max-sm:w-auto max-sm:max-w-none max-sm:py-5">
                        <span className="skeleton block h-3 w-2/5 rounded-[2px]" />
                      </td>
                      <td colSpan={5} className="max-sm:hidden" />
                    </tr>
                  ))}
                {shown.map((c) => {
                  const st = caseStatus(c);
                  return (
                    <tr
                      key={c.id}
                      data-testid="case-card"
                      data-case-id={c.id}
                      onMouseDown={() => {
                        pressedWhileEditing.current = editing !== null;
                      }}
                      onClick={(e) => rowClick(e, c)}
                      className="cursor-pointer border-b border-rule transition-colors duration-100 hover:bg-card focus-within:bg-card max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3"
                    >
                      <td className="h-[calc(52px*var(--fs))] w-full max-w-0 px-4 max-sm:col-span-2 max-sm:block max-sm:h-auto max-sm:w-auto max-sm:max-w-none max-sm:p-0">
                        <div className="flex min-w-0 items-center gap-2">
                          {editing === c.id ? (
                            <input
                              autoFocus
                              value={draft}
                              maxLength={80}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => void commitRename(c)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") {
                                  skipRename.current = true;
                                  setEditing(null);
                                }
                              }}
                              placeholder={t.casesNamePlaceholder}
                              aria-label={t.casesNamePlaceholder}
                              className="field min-w-0 flex-1 font-bold"
                            />
                          ) : (
                            <span
                              onDoubleClick={() => startRename(c)}
                              title={t.casesRename}
                              data-testid="case-name"
                              className="min-w-0 truncate text-t15 font-bold"
                            >
                              {c.book_name || <span className="font-normal text-ink3">{t.casesUntitled}</span>}
                            </span>
                          )}
                          {c.id === currentId && <span className="tag flex-none">{t.casesCurrent}</span>}
                        </div>
                      </td>
                      {/* Màn hẹp không còn cột nào cho ba số này: gộp thành một dòng dưới tên */}
                      <td className="tnum hidden text-t12 text-ink3 max-sm:block">
                        {t.casesSheets(c.sheets)} · {t.casesRows(c.rows)} · {fmt(c.updated_at)}
                      </td>
                      <td className="num px-4 text-right text-t14 text-ink2 max-sm:hidden">{c.sheets}</td>
                      <td className="num px-4 text-right text-t14 text-ink2 max-sm:hidden">{c.rows}</td>
                      <td className="px-4 whitespace-nowrap max-sm:block max-sm:p-0">
                        {st.kind === "empty" && <span className="text-t13 text-ink3">{t.casesNoResult}</span>}
                        {st.kind === "done" && (
                          <span data-testid="case-status" className="tag tag-ok">
                            {t.casesAllReviewed}
                          </span>
                        )}
                        {st.kind === "todo" && (
                          <span data-testid="case-status" className="tag tag-warn tnum">
                            {t.casesLeft(st.left)}
                          </span>
                        )}
                      </td>
                      <td title={t.casesCreated(fmt(c.created_at))} className="num px-4 text-t13 whitespace-nowrap text-ink2 max-sm:hidden">
                        {fmt(c.updated_at)}
                      </td>
                      <td className="pl-2 pr-3 max-sm:col-span-2 max-sm:block max-sm:p-0">
                        <div className="flex items-center justify-end gap-1 max-sm:justify-between">
                          <div className="row-acts flex items-center gap-0.5 max-sm:-ml-2">
                            <button type="button" onClick={() => startRename(c)} title={t.casesRename} aria-label={t.casesRename} className={ROW_ICON}>
                              <PencilSimple size={16} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleArchive(c)}
                              data-testid="case-archive"
                              title={c.archived ? t.casesUnarchive : t.casesArchive}
                              aria-label={c.archived ? t.casesUnarchive : t.casesArchive}
                              className={ROW_ICON}
                            >
                              {c.archived ? <ArrowUUpLeft size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setToDelete(c)}
                              data-testid="case-delete"
                              title={t.casesDelete}
                              aria-label={t.casesDelete}
                              className={`${ROW_ICON} hover:text-danger`}
                            >
                              <Trash size={16} aria-hidden />
                            </button>
                          </div>
                          <Link href={`/?ws=${c.id}`} data-testid="case-open" className="btn btn-ghost btn-sm no-underline max-sm:min-h-10 max-sm:px-4">
                            {t.casesOpen}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <DialogFrame labelledBy="newcase-title" onClose={() => !busy && setCreating(false)} maxWidth={420}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
            onKeyDown={(e) => e.key === "Escape" && !busy && setCreating(false)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="dlg-head">
              <h2 id="newcase-title" className="text-t16 font-bold">
                {t.casesNewTitle}
              </h2>
            </div>
            <div className="dlg-body flex flex-col gap-3">
              <p className="text-t13 leading-[1.7] text-ink2">{t.casesNewHint}</p>
              <input
                ref={newRef}
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.casesNamePlaceholder}
                aria-label={t.casesNamePlaceholder}
                data-testid="case-new-name"
                className="field"
              />
            </div>
            <div className="dlg-foot">
              <button type="button" onClick={() => setCreating(false)} disabled={busy} className="btn btn-quiet">
                {t.cancel}
              </button>
              <button type="submit" disabled={busy} data-testid="case-create" className="btn btn-primary">
                {t.casesCreate}
              </button>
            </div>
          </form>
        </DialogFrame>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={t.casesDeleteTitle}
        message={t.casesDeleteMsg(toDelete?.book_name || t.casesUntitled)}
        warning={t.casesDeleteWarn}
        confirmLabel={t.casesDeleteBtn}
        danger
        enterConfirms={false}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </div>
  );
}
