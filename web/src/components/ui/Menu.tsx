"use client";

/**
 * Menu bật ra từ một nút: ngôn ngữ, tài khoản.
 *
 * Vẽ qua portal ra thẳng <body> với position: fixed vì nút nằm trong thanh trên (sticky, có stacking context riêng):
 * để trong đó thì menu chìm dưới lớp tối của hướng dẫn, mà người Nhật lần đầu vào phải đổi được ngôn ngữ ngay giữa
 * hướng dẫn. z-80 cao hơn Tour (70) và hộp thoại (60).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Check } from "./icons";

export type MenuEntry =
  | { kind: "label"; key: string; text: string }
  | { kind: "sep"; key: string }
  | {
      kind: "item";
      key: string;
      text: ReactNode;
      icon?: ReactNode;
      /** Có giá trị (kể cả false) thì mục là một lựa chọn trong nhóm, có dấu ở mục đang chọn. */
      checked?: boolean;
      onSelect: () => void;
    };

const ITEM = "[data-menu-item]";

export default function Menu({
  label,
  title,
  className = "",
  minWidth = 208,
  entries,
  children,
}: {
  /** Tên của nút và của menu cho trình đọc màn hình. */
  label: string;
  title?: string;
  className?: string;
  minWidth?: number;
  entries: MenuEntry[];
  /** Nội dung của nút. */
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = pos !== null;

  const show = () => {
    const r = button.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  const close = useCallback((refocus: boolean) => {
    setPos(null);
    if (refocus) button.current?.focus();
  }, []);

  // Mở ra thì focus vào mục đang chọn, không thì mục đầu: phím mũi tên chạy được ngay
  useEffect(() => {
    if (!open) return;
    const items = panel.current?.querySelectorAll<HTMLElement>(ITEM);
    const on = panel.current?.querySelector<HTMLElement>(`${ITEM}[aria-checked="true"]`);
    (on ?? items?.[0])?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node;
      if (!panel.current?.contains(el) && !button.current?.contains(el)) close(false);
    };
    // Menu đứng yên theo toạ độ đã đo, nên trang cuộn hay đổi cỡ thì đóng còn hơn để nó lệch khỏi nút
    const onMove = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, close]);

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();                  // phím trong menu không được lọt ra phím tắt của bảng (n, p…) hay của hướng dẫn
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close(true);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        title={title}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            if (!open) show();
          }
        }}
        className={className}
      >
        {children}
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onPanelKey}
            style={{ top: pos.top, right: pos.right, minWidth, maxHeight: `calc(100dvh - ${pos.top + 8}px)` }}
            className="thin-scroll fixed z-[80] max-w-[calc(100vw-16px)] animate-[sheetIn_120ms_cubic-bezier(0.16,1,0.3,1)_both] overflow-y-auto rounded-[3px] bg-card p-1 text-ink shadow-lift motion-reduce:animate-none"
          >
            {entries.map((en) => {
              if (en.kind === "sep") return <div key={en.key} role="separator" className="-mx-1 my-1 h-px bg-rule2" />;
              if (en.kind === "label")
                return (
                  <div key={en.key} role="presentation" className="truncate px-2.5 pb-0.5 pt-1.5 text-t12 text-ink3">
                    {en.text}
                  </div>
                );
              const radio = en.checked !== undefined;
              return (
                <button
                  key={en.key}
                  type="button"
                  data-menu-item
                  tabIndex={-1}
                  role={radio ? "menuitemradio" : "menuitem"}
                  aria-checked={radio ? en.checked : undefined}
                  onClick={() => {
                    close(true);
                    en.onSelect();
                  }}
                  className="flex min-h-[calc(34px*var(--fs))] w-full cursor-pointer items-center gap-2.5 rounded-[2px] px-2.5 text-left text-t14 outline-offset-[-2px] transition-colors duration-100 hover:bg-card2 focus:bg-card2 active:bg-card3 max-sm:min-h-10"
                >
                  {en.icon && <span className="flex flex-none text-ink2">{en.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{en.text}</span>
                  {en.checked && <Check size={14} weight="bold" className="flex-none text-accent" aria-hidden />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
