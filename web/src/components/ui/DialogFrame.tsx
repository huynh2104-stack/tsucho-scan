"use client";

/**
 * Khung hộp thoại dùng chung: tờ chồng lên tờ, nền tối mờ phía sau, bấm ra ngoài là đóng.
 * Chỉ lo phần vỏ. Phím tắt và trạng thái vẫn ở từng hộp, vì mỗi hộp có luật Enter/Esc riêng.
 */

import type { ReactNode } from "react";

export default function DialogFrame({
  labelledBy,
  onClose,
  maxWidth = 440,
  role = "dialog",
  testId,
  z,
  children,
}: {
  labelledBy: string;
  onClose?: () => void;
  maxWidth?: number;
  role?: "dialog" | "alertdialog";
  testId?: string;
  z?: number;
  children: ReactNode;
}) {
  return (
    <div className="dlg-scrim" style={z ? { zIndex: z } : undefined} onClick={onClose} role="presentation">
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="dlg"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
