"use client";

/**
 * Đa ngôn ngữ VI / EN / JA — WEB_PLAN §8.
 *
 * LUẬT QUAN TRỌNG: tên cột sổ (摘要, 差引残高, お預り金額...) KHÔNG dịch.
 * Người dùng đang đối chiếu với ảnh in chữ 摘要 — dịch thành "Nội dung" là bắt
 * họ tra ngược. Chỉ dịch chữ của giao diện; tên cột giữ tiếng Nhật và thêm chú
 * thích nhỏ bên dưới (xem `colGloss`).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const LANGS = ["vi", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABEL: Record<Lang, string> = {
  vi: "VI",
  en: "EN",
  ja: "日本語",
};

const DICT = {
  vi: {
    appName: "通帳スキャン",
    tagline: "Sổ ngân hàng Nhật → bảng tính",

    theme: "Giao diện",
    themeLight: "Sáng",
    themeDark: "Tối",
    themeSystem: "Theo hệ thống",
    selectAll: "Chọn tất cả",
    scanning: "Đang quét...",
    bookNamePlaceholder: "Tên sổ",
    dropActive: "Thả ra để thêm vào danh sách",
    exportBtn: "Xuất file",
    cancel: "Huỷ",
    dropTitle: "Kéo thả hoặc chọn file",
    dropHint: "PNG · JPG · WEBP · PDF — PDF nhiều trang tự tách từng mặt",
    chosen: (n: number) => `Đã chọn (${n})`,
    scanN: (n: number) => `Quét (${n})`,
    scanThisPage: "Quét trang này",
    totalSheets: (n: number) => `Tổng số: ${n} mặt sổ`,
    shiftHint: "Shift để chọn nhiều",
    stScanned: (n: number) => `Đã quét (${n} dòng)`,
    sheetLabel: "Mặt sổ",
    reviewTitle: "Kết quả quét 通帳",
    reviewSubtitle: "Xem & chỉnh sửa trực tiếp dạng sổ ngân hàng",
    rowsWithData: (a: number, b: number) => `${a}/${b} dòng có số dư`,
    autoBalance: "Tự tính số dư",
    autoBalanceHint: "Suy số dư còn trống từ chuỗi: số dư trước − rút + gửi",
    addRow: "Thêm dòng",
    addRowHint: "Dùng khi máy bỏ sót một dòng — chuỗi số dư không tự phát hiện được",
    totalOut: "Tổng rút:",
    totalIn: "Tổng gửi:",
    lastBalance: "Số dư cuối:",

    // ── Cột trái
    railEmpty:
      "Chưa có mặt sổ nào. Kéo thả ảnh hoặc PDF vào đây — PDF nhiều trang sẽ được tách thành từng mặt riêng.",
    tickToScan: "Tích để chọn quét / chỉnh ảnh",
    clickToView: "Bấm để xem mặt sổ này",
    remove: "Xoá",
    cropped: "đã cắt",
    adjustedBadge: "đã chỉnh",
    duplicateBadge: "trùng",
    rowsShort: "dòng",
    stWaiting: "Đang chờ",
    stScanning: "Đang quét",
    stSkipped: "Bỏ qua",
    stNeedCheck: (n: number) => `${n} dòng cần soát`,
    stNoRows: "Không có giao dịch",

    // ── Khung giữa
    viewerEmpty: "Chưa chọn mặt sổ",
    viewerEmptyHint: "Bấm một mặt sổ ở cột trái để xem và chỉnh ảnh trước khi quét.",
    rotateLeft: "Xoay trái 90°",
    rotateRight: "Xoay phải 90°",
    flip180: "Lộn ngược",
    crop: "Cắt",
    cropApply: "Cắt vùng này",
    cropHint: "Kéo chuột trên ảnh để chọn vùng giữ lại",
    resetImage: "Về ảnh gốc",
    undo: "Hoàn tác",
    undoHint: "Hoàn tác thao tác chỉnh ảnh vừa rồi",
    undoNothing: "Không có bước nào để hoàn tác",
    fitFrame: "Vừa khung",
    fineTilt: "Nghiêng",
    brightness: "Độ sáng",
    contrast: "Tương phản",
    applyAdjust: "Áp dụng vào ảnh",
    discardPreview: "Bỏ thử",
    previewOnly: "Chỉ đang xem thử — chưa ghi vào ảnh",
    adjustHint: "Kéo thanh trượt để thử, ảnh chỉ đổi thật khi bấm Áp dụng",

    // ── Khung phải
    reviewEmpty: "Chưa có kết quả",
    reviewEmptyHint:
      "Tích chọn mặt sổ ở cột trái rồi bấm Quét. Kết quả hiện ở đây theo dạng mặt sổ.",
    viewCurrentPage: "Trang hiện tại",
    viewAsList: "Gộp danh sách",
    optionalCols: "Cột phụ",
    needCheck: "dòng cần soát",
    unknownBank: "(chưa rõ ngân hàng)",
    editableHint: "Bấm vào ô để sửa",
    pickSheetForPage: "Bấm một mặt sổ ở cột trái để xem kết quả của mặt đó.",
    sheetNoResult: (name: string) => `「${name}」chưa quét, hoặc không có giao dịch nào.`,

    // ── Hộp thoại xuất
    exportTitle: "Xuất file báo cáo sổ ngân hàng",
    exportSubtitle: "Chọn định dạng, phạm vi và cách trình bày",
    expFormat: "Định dạng file xuất",
    expXlsxHint: "Định dạng chuẩn Excel, có công thức kiểm tra",
    expCsvHint: "File văn bản ngăn cách bằng dấu phẩy",
    expScope: "Phạm vi xuất file",
    expScopeCurrent: "Chỉ mặt sổ đang xem",
    expScopeCurrentNone: "Chưa chọn mặt sổ nào để xem",
    expScopeTicked: (n: number) => `Các mặt sổ đã tích chọn (${n})`,
    expScopeAll: (n: number) => `Toàn bộ mặt sổ đã quét (${n})`,
    expStructure: "Cấu trúc trình bày",
    expPerSheet: "Tách theo mặt sổ",
    expPerSheetHint: "Mỗi mặt sổ thành một tab Sheet riêng",
    expPerSheetCsv: "CSV chỉ có một bảng — các mặt sổ nối tiếp, cách nhau dòng trống",
    expMerged: "Gộp chung một bảng",
    expMergedHint: "Nối tiếp mọi giao dịch theo chuỗi số dư",
    expAddTotal: "Tự thêm dòng Tổng cộng (合計) ở cuối mỗi sổ",
    expFileName: "Tên file",
    expDownload: "Xuất file tải về",
    expWorking: "Đang tạo file...",

    caveat:
      "Chuỗi số dư chỉ chứng minh các con số khớp nhau. Nó KHÔNG phát hiện được dòng bị bỏ sót hay tên đối tác đọc sai — hai lỗi đó vẫn phải soát bằng mắt.",

    colGloss: {
      date: "Ngày",
      desc: "Nội dung",
      out: "Tiền ra",
      in: "Tiền vào",
      bal: "Số dư",
      kind: "Loại",
      store: "Chi nhánh",
      extra: "Ghi chú",
      memo: "Kiểm tra",
    },
  },

  en: {
    appName: "通帳スキャン",
    tagline: "Japanese passbooks → spreadsheet",

    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    selectAll: "Select all",
    scanning: "Scanning...",
    bookNamePlaceholder: "Passbook name",
    dropActive: "Release to add to the list",
    exportBtn: "Export",
    cancel: "Cancel",
    dropTitle: "Drop or choose files",
    dropHint: "PNG · JPG · WEBP · PDF — multi-page PDFs are split per page",
    chosen: (n: number) => `Selected (${n})`,
    scanN: (n: number) => `Scan (${n})`,
    scanThisPage: "Scan this page",
    totalSheets: (n: number) => `Total: ${n} pages`,
    shiftHint: "Shift to multi-select",
    stScanned: (n: number) => `Scanned (${n} rows)`,
    sheetLabel: "Page",
    reviewTitle: "Scan result 通帳",
    reviewSubtitle: "Review & edit directly in passbook layout",
    rowsWithData: (a: number, b: number) => `${a}/${b} rows with balance`,
    autoBalance: "Fill balances",
    autoBalanceHint: "Derive missing balances from the chain: prev − debit + credit",
    addRow: "Add row",
    addRowHint: "Use when a row was missed — the balance chain cannot detect that",
    totalOut: "Total debit:",
    totalIn: "Total credit:",
    lastBalance: "Closing balance:",

    railEmpty:
      "No pages yet. Drop images or a PDF here — a multi-page PDF is split into separate pages.",
    tickToScan: "Tick to select for scanning / editing",
    clickToView: "Click to view this page",
    remove: "Remove",
    cropped: "cropped",
    adjustedBadge: "adjusted",
    duplicateBadge: "duplicate",
    rowsShort: "rows",
    stWaiting: "Waiting",
    stScanning: "Scanning",
    stSkipped: "Skipped",
    stNeedCheck: (n: number) => `${n} to review`,
    stNoRows: "No transactions",

    viewerEmpty: "No page selected",
    viewerEmptyHint: "Click a page on the left to view and adjust it before scanning.",
    rotateLeft: "Rotate left 90°",
    rotateRight: "Rotate right 90°",
    flip180: "Flip 180°",
    crop: "Crop",
    cropApply: "Crop this area",
    cropHint: "Drag on the image to choose what to keep",
    resetImage: "Reset image",
    undo: "Undo",
    undoHint: "Undo the last image adjustment",
    undoNothing: "Nothing to undo",
    fitFrame: "Fit frame",
    fineTilt: "Tilt",
    brightness: "Brightness",
    contrast: "Contrast",
    applyAdjust: "Apply to image",
    discardPreview: "Discard",
    previewOnly: "Preview only — not written to the image yet",
    adjustHint: "Drag to preview; the image changes only when you press Apply",

    reviewEmpty: "No results yet",
    reviewEmptyHint:
      "Tick pages on the left and press Scan. Results appear here, page by page.",
    viewCurrentPage: "Current page",
    viewAsList: "Combined list",
    optionalCols: "Extra columns",
    needCheck: "rows to review",
    unknownBank: "(bank not identified)",
    editableHint: "Click a cell to edit",
    pickSheetForPage: "Click a page on the left to see its result.",
    sheetNoResult: (name: string) => `“${name}” is not scanned yet, or has no transactions.`,

    exportTitle: "Export passbook report",
    exportSubtitle: "Choose format, scope and layout",
    expFormat: "File format",
    expXlsxHint: "Standard Excel, with live check formulas",
    expCsvHint: "Comma-separated text file",
    expScope: "Export scope",
    expScopeCurrent: "Only the page being viewed",
    expScopeCurrentNone: "No page is being viewed",
    expScopeTicked: (n: number) => `Ticked pages (${n})`,
    expScopeAll: (n: number) => `All scanned pages (${n})`,
    expStructure: "Layout",
    expPerSheet: "One tab per page",
    expPerSheetHint: "Each passbook page becomes its own Sheet tab",
    expPerSheetCsv: "CSV holds one table — pages follow each other, separated by a blank line",
    expMerged: "Single combined table",
    expMergedHint: "All transactions in balance-chain order",
    expAddTotal: "Add a Total (合計) row at the end of each account",
    expFileName: "File name",
    expDownload: "Export and download",
    expWorking: "Building file...",

    caveat:
      "The balance chain only proves the numbers agree with each other. It CANNOT detect a skipped row or a misread name — those still need your eyes.",

    colGloss: {
      date: "Date",
      desc: "Description",
      out: "Debit",
      in: "Credit",
      bal: "Balance",
      kind: "Type",
      store: "Branch",
      extra: "Note",
      memo: "Check",
    },
  },

  ja: {
    appName: "通帳スキャン",
    tagline: "通帳を表計算へ",

    theme: "表示",
    themeLight: "ライト",
    themeDark: "ダーク",
    themeSystem: "システムに合わせる",
    selectAll: "すべて選択",
    scanning: "スキャン中...",
    bookNamePlaceholder: "通帳名",
    dropActive: "離すとリストに追加します",
    exportBtn: "出力",
    cancel: "キャンセル",
    dropTitle: "ドロップまたはファイル選択",
    dropHint: "PNG · JPG · WEBP · PDF — 複数ページ PDF は1面ずつ分割",
    chosen: (n: number) => `選択中（${n}）`,
    scanN: (n: number) => `スキャン（${n}）`,
    scanThisPage: "この面をスキャン",
    totalSheets: (n: number) => `合計 ${n} 面`,
    shiftHint: "Shift で範囲選択",
    stScanned: (n: number) => `読取済（${n} 行）`,
    sheetLabel: "対象面",
    reviewTitle: "読取り結果 通帳",
    reviewSubtitle: "通帳レイアウトのまま確認・修正できます",
    rowsWithData: (a: number, b: number) => `残高あり ${a}/${b} 行`,
    autoBalance: "残高を自動計算",
    autoBalanceHint: "空欄の残高を チェーン（前残高 − 支払 + 預り）から補完",
    addRow: "行を追加",
    addRowHint: "行が抜けていた場合に使用 — 残高チェーンでは検出できません",
    totalOut: "お支払合計:",
    totalIn: "お預り合計:",
    lastBalance: "最終残高:",

    railEmpty:
      "まだありません。画像または PDF をドロップしてください — 複数ページの PDF は1面ずつに分割されます。",
    tickToScan: "チェックでスキャン・編集の対象に",
    clickToView: "クリックでこの面を表示",
    remove: "削除",
    cropped: "切抜済",
    adjustedBadge: "補正済",
    duplicateBadge: "重複",
    rowsShort: "行",
    stWaiting: "待機中",
    stScanning: "読取り中",
    stSkipped: "スキップ",
    stNeedCheck: (n: number) => `要確認 ${n} 行`,
    stNoRows: "取引なし",

    viewerEmpty: "面が選択されていません",
    viewerEmptyHint: "左の一覧から面を選ぶと、スキャン前に画像を確認・調整できます。",
    rotateLeft: "左に90°回転",
    rotateRight: "右に90°回転",
    flip180: "180°回転",
    crop: "切り抜き",
    cropApply: "この範囲で切り抜く",
    cropHint: "画像上をドラッグして残す範囲を選択",
    resetImage: "元の画像に戻す",
    undo: "元に戻す",
    undoHint: "直前の画像調整を元に戻す",
    undoNothing: "元に戻す操作がありません",
    fitFrame: "枠に合わせる",
    fineTilt: "傾き",
    brightness: "明るさ",
    contrast: "コントラスト",
    applyAdjust: "画像に適用",
    discardPreview: "取消",
    previewOnly: "プレビューのみ — 画像はまだ変更されていません",
    adjustHint: "スライダーで試せます。「画像に適用」を押すまで変更されません",

    reviewEmpty: "結果はまだありません",
    reviewEmptyHint:
      "左で面をチェックし、スキャンを押してください。結果は面ごとに表示されます。",
    viewCurrentPage: "現在の面",
    viewAsList: "一覧にまとめる",
    optionalCols: "追加列",
    needCheck: "行が要確認",
    unknownBank: "（銀行名 未確定）",
    editableHint: "セルをクリックで編集",
    pickSheetForPage: "左の一覧から面を選ぶと、その面の結果が表示されます。",
    sheetNoResult: (name: string) => `「${name}」は未スキャン、または取引がありません。`,

    exportTitle: "通帳明細の出力",
    exportSubtitle: "形式・範囲・レイアウトを選択",
    expFormat: "出力形式",
    expXlsxHint: "Excel 標準形式（検算式つき）",
    expCsvHint: "カンマ区切りテキスト",
    expScope: "出力範囲",
    expScopeCurrent: "表示中の面のみ",
    expScopeCurrentNone: "表示中の面がありません",
    expScopeTicked: (n: number) => `チェックした面（${n}）`,
    expScopeAll: (n: number) => `スキャン済のすべての面（${n}）`,
    expStructure: "レイアウト",
    expPerSheet: "面ごとにシート分割",
    expPerSheetHint: "1面を1つのシートタブに",
    expPerSheetCsv: "CSV は1つの表のみ — 面は空行区切りで連続します",
    expMerged: "1つの表にまとめる",
    expMergedHint: "残高チェーンの順に全取引を連結",
    expAddTotal: "口座末尾に合計行を追加する",
    expFileName: "ファイル名",
    expDownload: "出力してダウンロード",
    expWorking: "作成中...",

    caveat:
      "残高チェーンは数字の整合性のみを示します。行の欠落や摘要の誤読は検出できません — その二つは目視確認が必要です。",

    /* 日本語では列名がそのまま読めるので注釈なし */
    colGloss: {
      date: "",
      desc: "",
      out: "",
      in: "",
      bal: "",
      kind: "",
      store: "",
      extra: "",
      memo: "",
    },
  },
} as const;

export type Dict = (typeof DICT)["vi"];

const LangCtx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: "vi",
  t: DICT.vi,
  setLang: () => {},
});

const KEY = "tsucho.lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");

  // Đọc lựa chọn cũ sau khi hydrate — không đọc lúc render đầu để server và
  // client cho ra cùng một HTML.
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) {
      setLangState(saved as Lang);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(KEY, l);
    document.documentElement.lang = l;
  }, []);

  return (
    <LangCtx.Provider value={{ lang, t: DICT[lang] as Dict, setLang }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useT() {
  return useContext(LangCtx);
}
