"use client";

/**
 * Hồ sơ đang mở trên bàn làm việc — để thanh trên (nằm ở layout, ngoài trang) hiện được tên hồ sơ.
 *
 * Chỉ giữ MỘT thông tin hiển thị; nguồn sự thật vẫn là `Workspace` trong trang bàn làm việc, trang đó
 * đẩy tên/trạng thái vào đây mỗi khi đổi và xoá khi rời đi. Không lưu xuống đâu cả.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type CurrentCase = { id: string; name: string; archived: boolean };

type Ctx = {
  current: CurrentCase | null;
  setCurrent: (c: CurrentCase | null) => void;
};

const CaseCtx = createContext<Ctx>({ current: null, setCurrent: () => {} });

export function CaseProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<CurrentCase | null>(null);
  const value = useMemo<Ctx>(() => ({ current, setCurrent }), [current]);
  return <CaseCtx.Provider value={value}>{children}</CaseCtx.Provider>;
}

export function useCase() {
  return useContext(CaseCtx);
}

/** Khoá localStorage ghi hồ sơ đang làm dở của từng người dùng (bàn làm việc và trang danh sách cùng dùng). */
export const caseKey = (userId: string) => `tsucho.ws.${userId}`;
