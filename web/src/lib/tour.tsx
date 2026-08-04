"use client";

/**
 * Hướng dẫn sử dụng lần đầu.
 *
 * Chỗ này chỉ giữ TRẠNG THÁI (đang mở hay không, đã xem chưa). Phần vẽ nằm ở
 * `components/Tour.tsx`, còn nút dấu hỏi nằm ở `TopBar`. Tách ra vì ba thứ đó
 * ở ba nơi khác nhau trong cây React: TopBar nằm ở layout, còn overlay phải
 * nằm trong trang bàn làm việc mới chuyển được khung trên màn hình hẹp.
 *
 * "Đã xem" lưu ở localStorage theo TỪNG người dùng, không lưu ở server:
 * - không phải thêm cột vào bảng `users` (CSDL đang chạy thật sẽ không tự có
 *   cột mới, `CREATE TABLE IF NOT EXISTS` không thêm cột vào bảng đã tồn tại),
 * - đổi máy thì xem lại một lần — phiền không đáng kể, mà bấm Bỏ qua là xong.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth";

/** Đổi số này khi viết lại nội dung hướng dẫn → mọi người được xem bản mới. */
const VERSION = 1;

const keyFor = (userId: string) => `tsucho.tour.v${VERSION}.${userId}`;

type Ctx = {
  open: boolean;
  /** Mở từ ĐẦU — dùng cho nút dấu hỏi. */
  start: () => void;
  /** Đóng và ghi nhớ là đã xem (cả Bỏ qua lẫn xem hết đều gọi cái này). */
  stop: () => void;
  /** Chỉ mở nếu người này chưa từng xem. Bàn làm việc gọi khi đã sẵn sàng. */
  startIfFirstTime: () => void;
};

const TourCtx = createContext<Ctx>({
  open: false,
  start: () => {},
  stop: () => {},
  startIfFirstTime: () => {},
});

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const value = useMemo<Ctx>(() => {
    const key = user ? keyFor(user.id) : "";
    return {
      open,
      start: () => setOpen(true),
      stop: () => {
        setOpen(false);
        if (key) {
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* trình duyệt chặn localStorage — chỉ mất việc ghi nhớ, không sao */
          }
        }
      },
      startIfFirstTime: () => {
        if (!key) return;
        let seen = false;
        try {
          seen = localStorage.getItem(key) === "1";
        } catch {
          seen = true;   // không đọc được thì thà im lặng còn hơn hiện mãi
        }
        if (!seen) setOpen(true);
      },
    };
  }, [open, user]);

  return <TourCtx.Provider value={value}>{children}</TourCtx.Provider>;
}

export function useTour() {
  return useContext(TourCtx);
}
