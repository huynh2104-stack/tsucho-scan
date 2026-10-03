/**
 * Ba thứ tiếng phải có CÙNG khoá và CÙNG kiểu (chuỗi / hàm cùng số tham số).
 *
 * Vì sao cần: i18n.tsx đọc từ điển bằng `DICT[lang] as Dict` (ép kiểu), nên thiếu
 * một khoá ở `ja` hay `en` KHÔNG báo lỗi lúc build — chỉ hiện chữ "undefined" giữa
 * màn hình lúc chạy. Bài test này thay cho lưới an toàn của trình biên dịch.
 *
 * Chạy: `npm test` (Node chạy thẳng file .ts, không thêm thư viện nào).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DICT, LANGS, detectLang } from "./dict.ts";

test("ngôn ngữ lần đầu lấy từ trình duyệt: ja/vi/en, còn lại thì en", () => {
  assert.equal(detectLang(["ja-JP", "en-US"]), "ja");
  assert.equal(detectLang(["ja"]), "ja");
  assert.equal(detectLang(["vi-VN"]), "vi");
  assert.equal(detectLang(["VI"]), "vi");
  assert.equal(detectLang(["en-GB"]), "en");
  assert.equal(detectLang(["fr-FR", "vi", "en"]), "vi");      // bỏ qua ngôn ngữ không hỗ trợ, xét tiếp
  assert.equal(detectLang(["fr-FR", "de"]), "en");
  assert.equal(detectLang([]), "en");
  assert.equal(detectLang(undefined), "en");
});

/** Mọi "lá" của cây từ điển: đường dẫn → giá trị (chuỗi hoặc hàm). */
function leaves(node: unknown, path = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(node)) {
    node.forEach((value, i) => leaves(value, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) leaves(value, path ? `${path}.${key}` : key, out);
  } else {
    out.set(path, node);
  }
  return out;
}

/** "string", hoặc "fn/2" = hàm nhận 2 tham số (hai thứ tiếng phải nhận cùng số tham số). */
const kindOf = (value: unknown) => (typeof value === "function" ? `fn/${value.length}` : typeof value);

const XAU = /undefined|NaN|\[object/;

test("từ điển có đúng các ngôn ngữ khai báo trong LANGS", () => {
  assert.deepEqual(Object.keys(DICT).sort(), [...LANGS].sort());
});

test("từ điển tiếng Việt không rỗng (chặn test 'xanh giả' khi import hỏng)", () => {
  assert.ok(leaves(DICT.vi).size >= 200, `chỉ có ${leaves(DICT.vi).size} mục`);
});

for (const lang of LANGS.filter((l) => l !== "vi")) {
  test(`${lang} có cùng khoá và cùng kiểu với vi`, () => {
    const ref = leaves(DICT.vi);
    const got = leaves(DICT[lang]);
    const thieu = [...ref.keys()].filter((k) => !got.has(k));
    const thua = [...got.keys()].filter((k) => !ref.has(k));
    const khac = [...ref]
      .filter(([k, v]) => got.has(k) && kindOf(got.get(k)) !== kindOf(v))
      .map(([k, v]) => `${k}: vi=${kindOf(v)}, ${lang}=${kindOf(got.get(k))}`);
    assert.deepEqual({ thieu, thua, khac }, { thieu: [], thua: [], khac: [] });
  });
}

test("hàm dịch trả chuỗi bình thường, không lọt 'undefined'/'NaN'", () => {
  const loi: string[] = [];
  for (const lang of LANGS) {
    for (const [path, value] of leaves(DICT[lang])) {
      if (typeof value !== "function") continue;
      const out: unknown = value(...[3, 7, 9].slice(0, value.length));
      if (typeof out !== "string" || out === "" || XAU.test(out)) loi.push(`${lang}.${path} → ${String(out)}`);
    }
  }
  assert.deepEqual(loi, []);
});

test("chuỗi không rỗng và không chứa 'undefined' (trừ chú thích cột tiếng Nhật, cố ý để trống)", () => {
  const loi: string[] = [];
  for (const lang of LANGS) {
    for (const [path, value] of leaves(DICT[lang])) {
      if (typeof value !== "string") continue;
      const choPhepRong = lang === "ja" && path.startsWith("colGloss.");
      if ((value === "" && !choPhepRong) || XAU.test(value)) loi.push(`${lang}.${path}`);
    }
  }
  assert.deepEqual(loi, []);
});
