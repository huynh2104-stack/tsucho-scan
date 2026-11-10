"use client";

/**
 * Chọn một trong vài lựa chọn. Tờ trắng trượt dưới chữ khi đổi lựa chọn — mắt theo được cái vừa đổi.
 * `layoutId` phải DUY NHẤT trên trang (hai nhóm cùng id thì tờ trắng bay từ nhóm này sang nhóm kia).
 */

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  layoutId,
  label,
  className = "",
}: {
  value: T;
  options: { id: T; label: ReactNode; title?: string; testId?: string }[];
  onChange: (v: T) => void;
  layoutId: string;
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label={label} className={`seg isolate ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          data-testid={o.testId}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className="seg-btn"
        >
          {value === o.id && (
            <motion.span
              layoutId={layoutId}
              className="seg-thumb"
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}
