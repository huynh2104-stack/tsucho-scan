"use client";

/**
 * Từ điển sửa lỗi của người đang đăng nhập (task 3.3) — tải MỘT lần rồi tự so khớp ở trình duyệt (`corrections.ts`).
 * Nhờ vậy vừa học xong một cặp là các dòng giống hệt trong cùng sổ sáng lên ngay, không chờ mạng.
 *
 * `dictMode` (cài đặt ⚙, mặc định «chỉ gợi ý»): `off` thì không gợi ý, không học, không gửi gì lên máy chủ.
 * Đặt SAU `PrefsProvider` vì cần biết chế độ này.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clearDict, deleteDictEntry, getDict, learnDict, type DictEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { buildIndex, suggestFor, type DictField, type DictIndex } from "@/lib/corrections";
import { usePrefs } from "@/lib/prefs";

type Ctx = {
  entries: DictEntry[];
  index: DictIndex;
  /** Đã tải xong từ điển của người đang đăng nhập (lỗi mạng cũng coi là xong: từ điển rỗng). */
  loaded: boolean;
  mode: "suggest" | "auto" | "off";
  /** Chữ nên thay cho `text` ở ô `field`, hoặc null (không có / đã đúng / chế độ tắt). */
  suggest: (field: DictField, text: string | null | undefined) => string | null;
  /** Gửi một lần sửa lên để học; trả mục đã lưu (null nếu chế độ tắt hoặc máy chủ từ chối). */
  learn: (field: DictField, wrong: string, right: string) => Promise<DictEntry | null>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
};

const EMPTY = buildIndex([]);
const CorrCtx = createContext<Ctx>({
  entries: [],
  index: EMPTY,
  loaded: false,
  mode: "suggest",
  suggest: () => null,
  learn: async () => null,
  remove: async () => {},
  clear: async () => {},
});

export function CorrectionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const mode = prefs.dictMode;
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoaded(false);
      return;
    }
    let live = true;
    getDict()
      .then((d) => live && setEntries(d.entries))
      .catch(() => {
        /* máy chủ cũ chưa có route này / mất mạng: làm việc bình thường, chỉ không có gợi ý */
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [userId]);

  const index = useMemo(() => buildIndex(entries), [entries]);

  const suggest = useCallback(
    (field: DictField, text: string | null | undefined) => (mode === "off" ? null : suggestFor(index, field, text)),
    [index, mode],
  );

  const learn = useCallback(
    async (field: DictField, wrong: string, right: string) => {
      if (mode === "off" || !userId) return null;
      try {
        const e = await learnDict(field, wrong, right);
        setEntries((cur) => [e, ...cur.filter((x) => x.id !== e.id)]);
        return e;
      } catch {
        return null;                      // học không được thì thôi — việc sửa ô vẫn đã xong
      }
    },
    [mode, userId],
  );

  const remove = useCallback(async (id: number) => {
    await deleteDictEntry(id);
    setEntries((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await clearDict();
    setEntries([]);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ entries, index, loaded, mode, suggest, learn, remove, clear }),
    [entries, index, loaded, mode, suggest, learn, remove, clear],
  );
  return <CorrCtx.Provider value={value}>{children}</CorrCtx.Provider>;
}

export function useCorrections() {
  return useContext(CorrCtx);
}
