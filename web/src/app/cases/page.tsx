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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
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

  function startRename(c: WorkspaceBrief) {
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

  const empty = list !== null && shown.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">{t.casesTitle}</h1>
            <p className="mt-1 max-w-2xl text-[length:calc(13px*var(--fs))] leading-relaxed text-ink2">{t.casesSubtitle}</p>
          </div>
          <button
            data-testid="case-new"
            onClick={() => {
              setNewName("");
              setCreating(true);
            }}
            className="rounded-lg border border-accent bg-accent px-4 py-2 text-[length:calc(13.5px*var(--fs))] font-semibold text-accentink hover:brightness-110"
          >
            {t.casesNew}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-rule" role="tablist">
            {([false, true] as const).map((arch) => (
              <button
                key={String(arch)}
                role="tab"
                aria-selected={archivedTab === arch}
                onClick={() => setArchivedTab(arch)}
                className={`border-r border-rule px-3.5 py-1.5 text-[length:calc(13px*var(--fs))] last:border-r-0 ${
                  archivedTab === arch
                    ? "bg-accent font-semibold text-white"
                    : "bg-card text-ink2 hover:bg-accentpale hover:text-ink"
                }`}
              >
                {arch ? t.casesTabArchived : t.casesTabActive}
                <span className="tnum ml-1.5 opacity-80">{arch ? counts.archived : counts.active}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.casesSearch}
            aria-label={t.casesSearch}
            className="min-w-[200px] flex-1 rounded-lg border border-rule bg-card px-3 py-1.5 text-[length:calc(13.5px*var(--fs))] placeholder:text-ink3"
          />
        </div>

        {failed && (
          <p className="rounded-lg border border-warnedge bg-warnbg px-3 py-2 text-[length:calc(13px*var(--fs))] text-warnink" role="alert">
            {t.casesLoadFail}
          </p>
        )}

        {empty && !failed && (
          <p className="rounded-xl border border-dashed border-rule px-4 py-10 text-center text-[length:calc(13.5px*var(--fs))] text-ink3">
            {query.trim() && (list?.length ?? 0) > 0
              ? t.casesNoMatch
              : archivedTab
                ? t.casesEmptyArchived
                : t.casesEmpty}
          </p>
        )}

        <ul className="flex flex-col gap-2.5">
          {shown.map((c) => {
            const st = caseStatus(c);
            return (
              <li
                key={c.id}
                data-testid="case-card"
                data-case-id={c.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 ${
                  c.id === currentId ? "border-accent" : "border-rule"
                }`}
              >
                <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1">
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
                        className="min-w-0 flex-1 rounded-lg border border-accent bg-card px-2 py-1 text-[length:calc(15px*var(--fs))] font-semibold"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startRename(c)}
                        title={t.casesRename}
                        data-testid="case-name"
                        className="min-w-0 truncate text-[length:calc(15px*var(--fs))] font-semibold"
                      >
                        {c.book_name || <span className="font-normal text-ink3">{t.casesUntitled}</span>}
                      </span>
                    )}
                    {c.id === currentId && (
                      <span className="flex-none rounded bg-accentpale px-1.5 py-px text-[length:calc(10.5px*var(--fs))] font-bold text-accent">
                        {t.casesCurrent}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:calc(12px*var(--fs))] text-ink3">
                    <span>{t.casesCreated(fmt(c.created_at))}</span>
                    <span>{t.casesUpdated(fmt(c.updated_at))}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:calc(12.5px*var(--fs))] text-ink2">
                  <span className="tnum">{t.casesSheets(c.sheets)}</span>
                  {st.kind !== "empty" && <span className="tnum">{t.casesRows(c.rows)}</span>}
                  {st.kind === "empty" && <span className="text-ink3">{t.casesNoResult}</span>}
                  {st.kind === "done" && (
                    <span
                      data-testid="case-status"
                      className="rounded border border-okedge bg-okbg px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-okink"
                    >
                      {t.casesAllReviewed}
                    </span>
                  )}
                  {st.kind === "todo" && (
                    <span
                      data-testid="case-status"
                      className="tnum rounded border border-warnedge bg-warnbg px-2 py-0.5 text-[length:calc(12px*var(--fs))] font-semibold text-warnink"
                    >
                      {t.casesLeft(st.left)}
                    </span>
                  )}
                </div>

                <div className="flex flex-none items-center gap-1.5">
                  <Link
                    href={`/?ws=${c.id}`}
                    data-testid="case-open"
                    className="rounded-lg border border-accent bg-accent px-3.5 py-1.5 text-[length:calc(13px*var(--fs))] font-semibold text-accentink no-underline hover:brightness-110"
                  >
                    {t.casesOpen}
                  </Link>
                  <button
                    onClick={() => startRename(c)}
                    title={t.casesRename}
                    aria-label={t.casesRename}
                    className="rounded-lg border border-rule px-2.5 py-1.5 text-[length:calc(13px*var(--fs))] text-ink2 hover:border-accentmid hover:text-ink"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => void toggleArchive(c)}
                    data-testid="case-archive"
                    className="rounded-lg border border-rule px-3 py-1.5 text-[length:calc(13px*var(--fs))] text-ink2 hover:border-accentmid hover:text-ink"
                  >
                    {c.archived ? t.casesUnarchive : t.casesArchive}
                  </button>
                  <button
                    onClick={() => setToDelete(c)}
                    data-testid="case-delete"
                    className="rounded-lg border border-rule px-3 py-1.5 text-[length:calc(13px*var(--fs))] text-danger hover:border-danger"
                  >
                    {t.casesDelete}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {creating && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setCreating(false)}
          role="presentation"
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="newcase-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
            onKeyDown={(e) => e.key === "Escape" && !busy && setCreating(false)}
            className="w-full max-w-sm overflow-hidden rounded-xl border border-rule bg-card shadow-2xl"
          >
            <div className="flex flex-col gap-2 px-5 py-4">
              <h2 id="newcase-title" className="text-[length:calc(15px*var(--fs))] font-bold">
                {t.casesNewTitle}
              </h2>
              <p className="text-[length:calc(13px*var(--fs))] leading-relaxed text-ink2">{t.casesNewHint}</p>
              <input
                ref={newRef}
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.casesNamePlaceholder}
                aria-label={t.casesNamePlaceholder}
                data-testid="case-new-name"
                className="rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[length:calc(14px*var(--fs))] placeholder:text-ink3"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-rule bg-card2 px-5 py-3">
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={busy}
                className="rounded-lg border border-rule px-3.5 py-1.5 text-[length:calc(13.5px*var(--fs))] text-ink2 hover:border-accentmid hover:text-ink"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                data-testid="case-create"
                className="rounded-lg border border-accent bg-accent px-3.5 py-1.5 text-[length:calc(13.5px*var(--fs))] font-semibold text-accentink hover:brightness-110 disabled:opacity-50"
              >
                {t.casesCreate}
              </button>
            </div>
          </form>
        </div>
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
