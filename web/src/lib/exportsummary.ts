/**
 * «Tóm tắt trước khi xuất» (task 2.4): đếm những gì còn đáng xem lại TRONG PHẠM VI đang chọn để xuất.
 * Chỉ để NHẮC — không chặn việc xuất. Logic thuần, có test (`exportsummary.test.ts`).
 *
 * Ba thứ được đếm, mỗi thứ dùng đúng định nghĩa đã có (nên con số ở đây trùng với chỗ khác trên màn hình):
 * - dòng cần soát: `sheetStats(...).need` (cùng số với huy hiệu cột trái và bộ đếm «Còn N dòng»);
 * - chỗ đứt giữa các mặt: `isAlarm` (chắc cùng một sổ, chuỗi không nối, chưa bấm «Không phải lỗi»);
 * - cặp nghi trùng: `duplicatePairs` đã loại các cặp «Không phải trùng».
 * Chỗ đứt và cặp trùng chỉ tính khi CẢ HAI mặt đều nằm trong phạm vi xuất (như `dupPairsIn`).
 */

import type { ResultStore, Sheet } from "./api.ts";
import { isAlarm, sheetStats, type DupPair, type SheetLink } from "./review.ts";

export type ExportScope = "current" | "ticked" | "all";

export type ExportSummary = {
  need: number;
  breaks: number;
  dups: number;
  /** Mặt sổ ĐẦU TIÊN (theo thứ tự cột trái) còn dòng cần soát — đích của liên kết «Còn N dòng cần soát». */
  firstNeed: string | null;
  firstBreak: SheetLink | null;
  firstDup: DupPair | null;
};

export const hasIssues = (s: ExportSummary): boolean => s.need + s.breaks + s.dups > 0;

/** Các mặt sổ nằm trong phạm vi xuất. Chỉ mặt đã có kết quả mới được xuất nên chỉ mặt đó được tính. */
export function scopeIds(
  scope: ExportScope,
  store: ResultStore,
  active: string | null,
  ticked: ReadonlySet<string>,
): Set<string> {
  const have = Object.keys(store);
  if (scope === "all") return new Set(have);
  if (scope === "ticked") return new Set(have.filter((id) => ticked.has(id)));
  return new Set(active && store[active] ? [active] : []);
}

export function exportSummary(
  sheets: Pick<Sheet, "id">[],
  store: ResultStore,
  ids: ReadonlySet<string>,
  links: SheetLink[],
  dupPairs: DupPair[],
): ExportSummary {
  let need = 0;
  let firstNeed: string | null = null;
  for (const s of sheets) {
    if (!ids.has(s.id) || !store[s.id]) continue;
    const n = sheetStats(store[s.id].blocks).need;
    need += n;
    if (n > 0 && firstNeed === null) firstNeed = s.id;
  }
  const breaks = links.filter((l) => isAlarm(l) && ids.has(l.from) && ids.has(l.to));
  const dups = dupPairs.filter((p) => ids.has(p.a) && ids.has(p.b));
  return {
    need,
    breaks: breaks.length,
    dups: dups.length,
    firstNeed,
    firstBreak: breaks[0] ?? null,
    firstDup: dups[0] ?? null,
  };
}
