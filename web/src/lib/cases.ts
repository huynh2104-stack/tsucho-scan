/**
 * Logic thuần của trang danh sách hồ sơ (task 2.2): lọc, sắp xếp, tình trạng soát.
 * Tách khỏi giao diện để kiểm bằng `npm test` mà không cần trình duyệt.
 */

import type { WorkspaceBrief } from "./api.ts";

/** Bỏ dấu + hạ chữ thường để «nguyen» tìm ra «Nguyễn», «ＡＢＣ» (chữ rộng tiếng Nhật) tìm ra «abc». */
export function foldText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Hồ sơ khớp ô tìm kiếm (theo tên; ô trống = mọi hồ sơ). Hồ sơ chưa đặt tên không bao giờ khớp từ khoá. */
export function matchesQuery(c: Pick<WorkspaceBrief, "book_name">, query: string): boolean {
  const q = foldText(query);
  return q === "" || foldText(c.book_name).includes(q);
}

/** Mới sửa nhất lên đầu; bằng nhau thì mới tạo hơn lên trước. Không đổi mảng gốc. */
export function sortCases<T extends Pick<WorkspaceBrief, "updated_at" | "created_at">>(list: T[]): T[] {
  return [...list].sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at);
}

/** Danh sách hiển thị: đúng tab (đang làm / lưu trữ) + khớp tìm kiếm + đã sắp xếp. */
export function visibleCases(list: WorkspaceBrief[], query: string, archived: boolean): WorkspaceBrief[] {
  return sortCases(list.filter((c) => c.archived === archived && matchesQuery(c, query)));
}

/** Đếm theo tab (không tính ô tìm kiếm) để hiện số trên tab. */
export function countByTab(list: WorkspaceBrief[]): { active: number; archived: number } {
  const archived = list.filter((c) => c.archived).length;
  return { active: list.length - archived, archived };
}

/**
 * Tình trạng soát của một hồ sơ, theo con số máy chủ đã tính bằng định nghĩa «cần soát» chung:
 * - `empty`: chưa có dòng kết quả nào (chưa quét);
 * - `done`: có kết quả và không còn dòng nào cần soát;
 * - `todo`: còn `need` dòng cần soát.
 */
export type CaseStatus = { kind: "empty" } | { kind: "done" } | { kind: "todo"; left: number };

export function caseStatus(c: Pick<WorkspaceBrief, "rows" | "need">): CaseStatus {
  if (c.rows <= 0) return { kind: "empty" };
  return c.need > 0 ? { kind: "todo", left: c.need } : { kind: "done" };
}
