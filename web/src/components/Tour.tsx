"use client";

/**
 * Hướng dẫn từng bước: tô sáng đúng chỗ trên giao diện thật + một ô chú thích.
 *
 * Vì sao chỉ vào giao diện thật thay vì vẽ ảnh minh hoạ: người dùng cuối là kế
 * toán/giám đốc lớn tuổi người Nhật. Nhìn ảnh rồi phải tự tìm lại nút đó ở đâu
 * là bước dễ lạc nhất — chỉ thẳng vào nút thì không phải tìm.
 *
 * Cách tô sáng: một ô trong suốt đặt đúng vị trí phần tử, rồi `box-shadow` toả
 * ra 9999px để làm tối phần còn lại. Nhẹ hơn nhiều so với cắt lỗ bằng clip-path
 * hay bốn tấm che quanh, và bo góc được.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { useTour } from "@/lib/tour";

export type PaneId = "list" | "image" | "result";

/** `at` = giá trị `data-tour` của phần tử được chỉ vào. */
type Step = { at: string; pane?: PaneId; title: string; body: string };

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;          // nới khung sáng ra ngoài phần tử một chút cho dễ nhìn
const CARD_W = 330;
const GAP = 12;         // khoảng cách giữa khung sáng và ô chú thích
const SCRIM = "color-mix(in srgb, var(--shell) 68%, transparent)";   // tối theo màu mực của app, không phải đen

/** Hai lần đo có ra cùng một chỗ không.
 *
 * Bắt buộc phải có: `setBox` với object MỚI mỗi lần đo thì React coi là state
 * đã đổi kể cả khi bốn con số y hệt → vẽ lại → effect đo lại → vẽ lại... Vòng
 * lặp này chạy ngầm không báo lỗi gì, chỉ thấy khung sáng đứng ì ở góc trên
 * trái vì lần chuyển vị trí nào cũng bị lần sau cắt ngang.
 */
function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.top === b.top && a.left === b.left &&
    a.width === b.width && a.height === b.height
  );
}

export default function Tour({ onPane }: { onPane: (p: PaneId) => void }) {
  const { t } = useT();
  const { open, stop } = useTour();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const steps: Step[] = [
    { at: "drop", pane: "list", title: t.tour.s1Title, body: t.tour.s1Body },
    { at: "rail", pane: "list", title: t.tour.s2Title, body: t.tour.s2Body },
    { at: "scan", pane: "list", title: t.tour.s3Title, body: t.tour.s3Body },
    { at: "viewer", pane: "image", title: t.tour.s4Title, body: t.tour.s4Body },
    { at: "review", pane: "result", title: t.tour.s5Title, body: t.tour.s5Body },
    { at: "export", pane: "result", title: t.tour.s6Title, body: t.tour.s6Body },
    { at: "cases", title: t.tour.sCasesTitle, body: t.tour.sCasesBody },
    { at: "help", title: t.tour.s7Title, body: t.tour.s7Body },
  ];
  const last = i >= steps.length - 1;
  const step = steps[Math.min(i, steps.length - 1)];

  // Mở lại từ đầu mỗi lần bật — nút dấu hỏi phải hướng dẫn "từ đầu" như đã hứa
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Màn hình hẹp chỉ hiện MỘT khung; khung đang ẩn thì `getBoundingClientRect`
  // trả về toàn số 0 nên phải chuyển khung trước rồi mới đo.
  useEffect(() => {
    if (open && step.pane) onPane(step.pane);
  }, [open, step.pane, onPane]);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.at}"]`);
    const r = el?.getBoundingClientRect();
    // Không tìm thấy, hoặc tìm thấy nhưng đang ẩn (0×0) → bỏ khung sáng, ô chú
    // thích tự về giữa màn hình. Vẫn đọc được nội dung, chỉ là không có mũi chỉ.
    const next =
      !r || r.width === 0 || r.height === 0
        ? null
        : {
            top: r.top - PAD,
            left: r.left - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
          };
    // Trả về CHÍNH state cũ khi không đổi — React thấy cùng một tham chiếu thì
    // không vẽ lại, nhờ vậy không có vòng lặp đo ↔ vẽ.
    setBox((cur) => (sameBox(cur, next) ? cur : next));
  }, [step.at]);

  /* Đo lại sau MỖI lần vẽ — KHÔNG có mảng phụ thuộc. Cùng cách với `SheetViewer`
   * (xem ghi chú ở đó), và cũng vì đúng lý do đó.
   *
   * Trên màn hình hẹp, bước 4-6 phải chuyển khung trước rồi phần tử mới hiện
   * ra. Chuyển khung là một lần vẽ NỮA của React; đo một lần theo `[step.at]`
   * thì lúc đó phần tử còn `display:none`, đo ra 0×0, và không có gì gọi đo
   * lại — mất khung sáng.
   *
   * Đừng thay bằng `ResizeObserver`: đã thử và đo tại chỗ trong trình duyệt,
   * nó **không bắn** khi phần tử đi từ `display:none` sang hiện — width nhảy
   * 0 → 375 mà callback im lặng. `SheetViewer` cũng đã gặp đúng chuyện này.
   *
   * Không lặp vô tận vì `measure` chỉ đổi state khi bốn con số ĐO ĐƯỢC khác đi.
   */
  useLayoutEffect(() => {
    if (open) measure();
  });

  // Đổi cỡ cửa sổ và cuộn trong cột KHÔNG làm React vẽ lại, nên hai thứ đó vẫn
  // phải nghe riêng.
  useEffect(() => {
    if (!open) return;
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    // capture: cuộn xảy ra ở cột con chứ không ở window
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stop, steps.length]);

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, i]);

  if (!open) return null;

  // Đặt ô chú thích: ưu tiên dưới khung sáng, không đủ chỗ thì lên trên, vẫn
  // không đủ thì ép vào trong màn hình. Luôn kẹp trong mép để không lòi ra.
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const CARD_H = 190;                       // ước lượng, chỉ để chọn trên/dưới
  let cardTop = vh / 2 - CARD_H / 2;
  let cardLeft = vw / 2 - CARD_W / 2;
  if (box) {
    const below = box.top + box.height + GAP;
    cardTop = below + CARD_H < vh ? below : Math.max(GAP, box.top - CARD_H - GAP);
    cardLeft = Math.min(
      Math.max(GAP, box.left + box.width / 2 - CARD_W / 2),
      vw - CARD_W - GAP,
    );
  }

  return (
    /* `pointer-events-none` ở lớp ngoài cùng — hướng dẫn KHÔNG khoá màn hình.
       Lý do rất cụ thể: giao diện mặc định là tiếng Việt, nên người Nhật vào
       lần đầu gặp ngay hướng dẫn tiếng Việt. Nếu lớp phủ nuốt click thì họ
       không bấm nổi nút 日本語 ở thanh trên — phải Bỏ qua rồi mới đổi được.
       Cho click xuyên qua thì đổi ngôn ngữ giữa chừng cũng được, và nội dung
       hướng dẫn đổi theo ngay. Đóng bằng nút Bỏ qua hoặc phím Esc. */
    <div className="pointer-events-none fixed inset-0 z-[70]" role="dialog" aria-labelledby="tour-title">
      {box ? (
        <div
          /* KHÔNG dùng transition cho top/left: lần vẽ đầu tiên `top` đi từ
             `auto` nên trình duyệt cho chạy từ 0, khung sáng bay từ góc màn
             hình vào. Nhảy thẳng tới nơi vừa chắc vừa đỡ hoa mắt. */
          className="pointer-events-none absolute rounded-[3px]"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            // Viền trắng thay vì cobalt: khung sáng phải nổi được trên cả tờ sáng lẫn thanh mực
            boxShadow: `0 0 0 2px var(--shell-ink), 0 0 0 9999px ${SCRIM}`,
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
      )}

      <div
        className="pointer-events-auto absolute flex w-[330px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[4px] bg-card shadow-lift"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex flex-col gap-2 px-5 pb-4 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tour-title" className="min-w-0 text-t16 font-bold">
              {step.title}
            </h2>
            <span className="num flex-none text-t12 text-ink3">{t.tour.step(i + 1, steps.length)}</span>
          </div>
          <p className="text-t14 leading-[1.7] text-ink2">{step.body}</p>
        </div>

        <div className="flex items-center gap-2 border-t border-rule2 bg-card2 py-2.5 pl-3 pr-4">
          <button type="button" onClick={stop} className="btn btn-ghost btn-sm max-sm:min-h-10">
            {t.tour.skip}
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={() => setI((n) => n - 1)} className="btn btn-quiet max-sm:min-h-10">
              {t.tour.back}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? stop() : setI((n) => n + 1))}
            className="btn btn-primary max-sm:min-h-10"
          >
            {last ? t.tour.done : t.tour.next}
          </button>
        </div>
      </div>
    </div>
  );
}
