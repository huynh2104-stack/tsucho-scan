import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkspaceBrief } from "./api.ts";
import { caseStatus, countByTab, foldText, matchesQuery, sortCases, visibleCases } from "./cases.ts";

function brief(over: Partial<WorkspaceBrief> & { id: string }): WorkspaceBrief {
  return {
    book_name: "",
    created_at: 100,
    updated_at: 100,
    archived: false,
    sheets: 0,
    scanned: 0,
    rows: 0,
    need: 0,
    confirmed: 0,
    ...over,
  };
}

test("foldText: bỏ dấu tiếng Việt, hạ chữ thường, đ → d, chữ rộng tiếng Nhật về chữ thường", () => {
  assert.equal(foldText("  Nguyễn Văn Đạt "), "nguyen van dat");
  assert.equal(foldText("ＡＢＣ商店"), "abc商店");
});

test("matchesQuery: ô trống khớp mọi hồ sơ, kể cả hồ sơ chưa đặt tên", () => {
  assert.ok(matchesQuery({ book_name: "" }, ""));
  assert.ok(matchesQuery({ book_name: "" }, "   "));
  assert.ok(matchesQuery({ book_name: "Khách A" }, ""));
});

test("matchesQuery: gõ không dấu vẫn tìm ra tên có dấu; từ khoá không có trong tên thì không khớp", () => {
  assert.ok(matchesQuery({ book_name: "Nguyễn Văn A" }, "nguyen"));
  assert.ok(matchesQuery({ book_name: "Nguyễn Văn A" }, "VAN a"));
  assert.ok(!matchesQuery({ book_name: "Nguyễn Văn A" }, "tran"));
  assert.ok(!matchesQuery({ book_name: "" }, "tran"));          // chưa đặt tên thì chỉ hiện khi ô tìm trống
  assert.ok(matchesQuery({ book_name: "山田商店 2025" }, "山田"));
});

test("sortCases: sửa gần nhất lên đầu, bằng nhau thì tạo muộn hơn lên trước, không đổi mảng gốc", () => {
  const src = [
    brief({ id: "a", updated_at: 10, created_at: 1 }),
    brief({ id: "b", updated_at: 30, created_at: 2 }),
    brief({ id: "c", updated_at: 30, created_at: 5 }),
    brief({ id: "d", updated_at: 20, created_at: 9 }),
  ];
  assert.deepEqual(sortCases(src).map((c) => c.id), ["c", "b", "d", "a"]);
  assert.deepEqual(src.map((c) => c.id), ["a", "b", "c", "d"]);
});

test("visibleCases: tách đúng hai tab và áp ô tìm kiếm lên tab đang xem", () => {
  const src = [
    brief({ id: "a", book_name: "Khách A", updated_at: 1 }),
    brief({ id: "b", book_name: "Khách B", updated_at: 2, archived: true }),
    brief({ id: "c", book_name: "Công ty C", updated_at: 3 }),
  ];
  assert.deepEqual(visibleCases(src, "", false).map((c) => c.id), ["c", "a"]);
  assert.deepEqual(visibleCases(src, "", true).map((c) => c.id), ["b"]);
  assert.deepEqual(visibleCases(src, "khach", false).map((c) => c.id), ["a"]);
  assert.deepEqual(visibleCases(src, "khach", true).map((c) => c.id), ["b"]);
  assert.deepEqual(visibleCases(src, "xyz", false), []);
});

test("countByTab: số đếm không bị ô tìm kiếm làm lệch", () => {
  const src = [brief({ id: "a" }), brief({ id: "b", archived: true }), brief({ id: "c" })];
  assert.deepEqual(countByTab(src), { active: 2, archived: 1 });
  assert.deepEqual(countByTab([]), { active: 0, archived: 0 });
});

test("caseStatus: chưa quét / đã soát hết / còn N dòng", () => {
  assert.deepEqual(caseStatus({ rows: 0, need: 0 }), { kind: "empty" });
  assert.deepEqual(caseStatus({ rows: 12, need: 0 }), { kind: "done" });
  assert.deepEqual(caseStatus({ rows: 12, need: 3 }), { kind: "todo", left: 3 });
});
