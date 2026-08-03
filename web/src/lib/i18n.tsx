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
    accountNo: (i: number, n: number) => `Sổ ${i}/${n}`,
    undoEditLabel: "Hoàn tác sửa bảng",
    redoEditLabel: "Làm lại",
    dragHint: "Kéo để đổi thứ tự",
    trySample: "Thử với sổ mẫu",
    trySampleHint: "Dữ liệu giả lập — chạy hết luồng, không tốn lượt gọi API",
    undoEdit: "Hoàn tác",
    redoEdit: "Làm lại",
    nextBad: "Dòng cần soát sau",
    nextBadHint: "Nhảy tới dòng cần soát và đặt con trỏ vào đúng ô sai",
    badLeft: (n: number) => `Còn ${n} dòng cần soát`,
    allChecked: "Đã soát hết",
    rowLinkExact: "khung đỏ: dò được đúng dòng trên ảnh",
    rowLinkEstimated: "khung đỏ: vị trí ước lượng",
    rowMarkExact: "dòng này",
    rowMarkEstimated: "dòng này (ước lượng)",
    staleTitle: "Kết quả không còn khớp ảnh",
    staleMsg: "Ảnh đã bị xoay/cắt/chỉnh sau khi quét — kết quả đang hiện là của ảnh cũ.",
    rescanNow: "Quét lại",
    pageLabel: (n: number) => `tr.${n}`,
    dblClickRename: "Click đúp để đổi tên",
    deleteSheet: "Xoá mặt sổ",
    deleteRow: "Xoá dòng",
    matched: (n: number) => `${n} dòng khớp`,
    filterPlaceholder: "Lọc theo nội dung / đối tác...",
    filterClear: "Bỏ lọc",
    filterNote: "chỉ để xem, không ảnh hưởng file xuất",
    autofixTitle: "Cắt nhanh:",
    autofixApply: "Áp dụng",
    autofixNo180: "không tự nhận được ảnh lộn ngược 180°",
    afRotate: (d: number) => `xoay ${d}°`,
    afTilt: (d: number) => `chỉnh nghiêng ${d > 0 ? "+" : ""}${d}°`,
    afCrop: "cắt viền thừa",
    splitTwo: "Tách 2 sổ",
    splitHint: "Ảnh này có vẻ chứa 2 sổ — tách ra quét riêng đọc chính xác hơn",
    confirmResetTitle: "Về ảnh gốc?",
    confirmResetMsg:
      "Mọi lần xoay, cắt và chỉnh sáng của mặt sổ này sẽ bị bỏ. Vẫn bấm Hoàn tác được một bước sau đó.",
    confirmDeleteSheetTitle: "Xoá mặt sổ này?",
    confirmDeleteSheetMsg: (name: string) => `Sẽ xoá「${name}」khỏi danh sách.`,
    confirmDeleteSheetHasResult:
      "Mặt sổ này đã có kết quả quét — xoá là mất luôn kết quả đó.",
    confirmDeleteManyTitle: "Xoá các mặt sổ đã chọn?",
    confirmDeleteManyMsg: (n: number) => `Sẽ xoá ${n} mặt sổ khỏi danh sách.`,
    confirmDeleteManyHasResult: (n: number) =>
      `${n} trong số đó đã có kết quả quét — xoá là mất luôn kết quả.`,
    confirmDeleteRowTitle: "Xoá dòng này?",
    confirmDeleteRowMsg:
      "Dòng sẽ bị bỏ khỏi kết quả và khỏi file xuất. Quét lại mặt sổ thì dòng quay về.",
    confirmSplitTitle: "Tách thành 2 mặt sổ?",
    confirmSplitMsg:
      "Ảnh sẽ cắt thành nửa trái và nửa phải, thành hai mặt sổ riêng để quét độc lập.",
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
    stFailed: "Không quét được",
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
    undo: "Hoàn tác ảnh",
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

    signIn: "Đăng nhập",
    signUp: "Đăng ký",
    signOut: "Đăng xuất",
    authEmail: "Email",
    authPassword: "Mật khẩu",
    authPasswordHint: "Ít nhất 8 ký tự",
    authHeadIn: "Đăng nhập để tiếp tục",
    authHeadUp: "Tạo tài khoản mới",
    authToUp: "Chưa có tài khoản? Đăng ký",
    authToIn: "Đã có tài khoản? Đăng nhập",
    authWorking: "Đang xử lý...",
    authChecking: "Đang kiểm tra đăng nhập...",
    authPrivacy:
      "Ảnh sổ và kết quả chỉ hiện với tài khoản đã tải lên. Người khác đăng nhập vào máy này cũng không thấy dữ liệu của anh/chị.",
    authClaimed: (n: number) =>
      `Đã chuyển ${n} không gian làm việc có sẵn về tài khoản này.`,
    authAccount: "Tài khoản",

    saveSaving: "Đang lưu...",
    saveSaved: "Đã lưu",
    saveFailed: "Chưa lưu được",

    dragCopyHint: "Kéo chuột để bôi đen nhiều ô · Ctrl+C chép sang Excel",
    pickedCells: (n: number) => `Đã chọn ${n} ô — Ctrl+C để chép`,

    errNotBankbook: (s: string) =>
      `${s ? `「${s}」` : "Ảnh này"} không phải sổ ngân hàng (通帳) nên không quét được. Hãy kiểm tra lại xem có chọn nhầm file không.`,
    errUnreadable: (s: string) =>
      `${s ? `「${s}」` : "Ảnh này"} quá mờ nên không đọc được. Hãy chụp/scan lại rõ hơn, hoặc thử cắt sát vào phần bảng giao dịch.`,
    errNoRows: (s: string) =>
      `${s ? `「${s}」` : "Ảnh này"} không có dòng giao dịch nào (có thể là trang bìa hoặc trang trắng).`,

    warp: "Nắn phối cảnh",
    warpApply: "Áp dụng nắn",
    warpHint: "Kéo 4 góc (tròn) ôm lấy trang sổ; 4 điểm vuông ở giữa cạnh để uốn cong khi sổ không bẹt phẳng. Hai thanh Dọc/Ngang bên dưới sẽ đặt lại toàn bộ",
    warpVert: "Nắn dọc — sổ chụp chếch trên/dưới",
    warpHorz: "Nắn ngang — sổ chụp chếch trái/phải",
    warpCorner: (n: number) => `Góc ${n} — kéo để chỉnh`,

    errTooLarge: (s: string, size: number, limit: number) =>
      `${s ? `「${s}」` : "Ảnh này"} quá lớn (${size}MB, giới hạn ${limit}MB). Hãy giảm kích thước ảnh.`,

    warpMid: (n: number) => `Điểm giữa cạnh ${n} — kéo để uốn cong cạnh (sổ không bẹt phẳng)`,

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
    accountNo: (i: number, n: number) => `Acct ${i}/${n}`,
    undoEditLabel: "Undo table edit",
    redoEditLabel: "Redo",
    dragHint: "Drag to reorder",
    trySample: "Try a sample passbook",
    trySampleHint: "Synthetic data — full workflow, no API calls used",
    undoEdit: "Undo",
    redoEdit: "Redo",
    nextBad: "Next flagged row",
    nextBadHint: "Jump to the next flagged row and put the caret in the offending cell",
    badLeft: (n: number) => `${n} row(s) left to review`,
    allChecked: "All reviewed",
    rowLinkExact: "red frame: row located on the image",
    rowLinkEstimated: "red frame: estimated position",
    rowMarkExact: "this row",
    rowMarkEstimated: "this row (estimated)",
    staleTitle: "Result no longer matches the image",
    staleMsg: "The image was rotated/cropped/adjusted after scanning — these results belong to the older image.",
    rescanNow: "Re-scan",
    pageLabel: (n: number) => `p.${n}`,
    dblClickRename: "Double-click to rename",
    deleteSheet: "Delete page",
    deleteRow: "Delete row",
    matched: (n: number) => `${n} matching`,
    filterPlaceholder: "Filter by description / party...",
    filterClear: "Clear",
    filterNote: "view only, does not affect the exported file",
    autofixTitle: "Quick fix:",
    autofixApply: "Apply",
    autofixNo180: "cannot detect an upside-down (180°) image",
    afRotate: (d: number) => `rotate ${d}°`,
    afTilt: (d: number) => `straighten ${d > 0 ? "+" : ""}${d}°`,
    afCrop: "trim borders",
    splitTwo: "Split into 2",
    splitHint: "This image seems to hold 2 passbooks — splitting reads more accurately",
    confirmResetTitle: "Reset to original?",
    confirmResetMsg:
      "All rotation, cropping and brightness changes on this page will be dropped. You can still Undo one step afterwards.",
    confirmDeleteSheetTitle: "Delete this page?",
    confirmDeleteSheetMsg: (name: string) => `“${name}” will be removed from the list.`,
    confirmDeleteSheetHasResult:
      "This page already has scan results — deleting loses them too.",
    confirmDeleteManyTitle: "Delete selected pages?",
    confirmDeleteManyMsg: (n: number) => `${n} page(s) will be removed from the list.`,
    confirmDeleteManyHasResult: (n: number) =>
      `${n} of them already have scan results — deleting loses those too.`,
    confirmDeleteRowTitle: "Delete this row?",
    confirmDeleteRowMsg:
      "The row leaves the result and the exported file. Re-scanning the page brings it back.",
    confirmSplitTitle: "Split into 2 pages?",
    confirmSplitMsg:
      "The image is cut into a left and a right half, becoming two pages you can scan separately.",
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
    stFailed: "Scan failed",
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
    undo: "Undo image",
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

    signIn: "Sign in",
    signUp: "Sign up",
    signOut: "Sign out",
    authEmail: "Email",
    authPassword: "Password",
    authPasswordHint: "At least 8 characters",
    authHeadIn: "Sign in to continue",
    authHeadUp: "Create an account",
    authToUp: "No account yet? Sign up",
    authToIn: "Already have an account? Sign in",
    authWorking: "Working...",
    authChecking: "Checking your session...",
    authPrivacy:
      "Passbook images and results are visible only to the account that uploaded them. Another person signing in on this machine cannot see your data.",
    authClaimed: (n: number) => `Moved ${n} existing workspace(s) to this account.`,
    authAccount: "Account",

    saveSaving: "Saving...",
    saveSaved: "Saved",
    saveFailed: "Not saved",

    dragCopyHint: "Drag to select cells · Ctrl+C copies to Excel",
    pickedCells: (n: number) => `${n} cells selected — Ctrl+C to copy`,

    errNotBankbook: (s: string) =>
      `${s ? `"${s}"` : "This image"} is not a bank passbook (通帳), so it cannot be scanned. Please check whether you picked the wrong file.`,
    errUnreadable: (s: string) =>
      `${s ? `"${s}"` : "This image"} is too blurry to read. Please re-shoot or re-scan it more sharply, or crop closer to the transaction table.`,
    errNoRows: (s: string) =>
      `${s ? `"${s}"` : "This image"} has no transaction rows (it may be a cover page or a blank page).`,

    warp: "Perspective",
    warpApply: "Apply perspective",
    warpHint: "Drag the 4 round corners onto the page; the 4 square midpoints curve each edge when the book will not lie flat. The sliders below reset everything",
    warpVert: "Vertical — shot from above/below",
    warpHorz: "Horizontal — shot from the left/right",
    warpCorner: (n: number) => `Corner ${n} — drag to adjust`,

    errTooLarge: (s: string, size: number, limit: number) =>
      `${s ? `"${s}"` : "This image"} is too large (${size}MB, limit ${limit}MB). Please reduce the image size.`,

    warpMid: (n: number) => `Edge midpoint ${n} — drag to curve the edge (book not lying flat)`,

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
    accountNo: (i: number, n: number) => `口座 ${i}/${n}`,
    undoEditLabel: "表の編集を元に戻す",
    redoEditLabel: "やり直し",
    dragHint: "ドラッグで並べ替え",
    trySample: "サンプル通帳で試す",
    trySampleHint: "架空データ — API 呼び出しなしで全機能を確認できます",
    undoEdit: "元に戻す",
    redoEdit: "やり直し",
    nextBad: "次の要確認行",
    nextBadHint: "次の要確認行へ移動し、問題のセルにカーソルを置きます",
    badLeft: (n: number) => `要確認 残り ${n} 行`,
    allChecked: "確認済み",
    rowLinkExact: "赤枠：画像上の行を検出",
    rowLinkEstimated: "赤枠：推定位置",
    rowMarkExact: "この行",
    rowMarkEstimated: "この行（推定）",
    staleTitle: "結果が画像と一致しません",
    staleMsg: "スキャン後に画像を回転・切り抜き・補正しました。表示中の結果は以前の画像のものです。",
    rescanNow: "再スキャン",
    pageLabel: (n: number) => `${n}頁`,
    dblClickRename: "ダブルクリックで名前を変更",
    deleteSheet: "この面を削除",
    deleteRow: "行を削除",
    matched: (n: number) => `一致 ${n} 行`,
    filterPlaceholder: "摘要・取引先で絞り込み...",
    filterClear: "解除",
    filterNote: "表示のみ。出力ファイルには影響しません",
    autofixTitle: "自動補正:",
    autofixApply: "適用",
    autofixNo180: "上下逆（180°）は自動判定できません",
    afRotate: (d: number) => `${d}°回転`,
    afTilt: (d: number) => `傾き補正 ${d > 0 ? "+" : ""}${d}°`,
    afCrop: "余白を切り取り",
    splitTwo: "2冊に分割",
    splitHint: "この画像は2冊分の可能性 — 分割して個別に読取ると精度が上がります",
    confirmResetTitle: "元の画像に戻しますか？",
    confirmResetMsg:
      "この面の回転・切り抜き・明るさ調整はすべて破棄されます。直後なら「元に戻す」で1段階だけ復元できます。",
    confirmDeleteSheetTitle: "この面を削除しますか？",
    confirmDeleteSheetMsg: (name: string) => `「${name}」を一覧から削除します。`,
    confirmDeleteSheetHasResult: "この面には読取り結果があります — 削除すると結果も失われます。",
    confirmDeleteManyTitle: "選択した面を削除しますか？",
    confirmDeleteManyMsg: (n: number) => `${n} 面を一覧から削除します。`,
    confirmDeleteManyHasResult: (n: number) =>
      `うち ${n} 面には読取り結果があります — 削除すると結果も失われます。`,
    confirmDeleteRowTitle: "この行を削除しますか？",
    confirmDeleteRowMsg:
      "結果と出力ファイルから外れます。面を再スキャンすれば戻ります。",
    confirmSplitTitle: "2つの面に分割しますか？",
    confirmSplitMsg:
      "画像を左半分と右半分に切り分け、それぞれ独立してスキャンできる面にします。",
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
    stFailed: "読取不可",
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
    undo: "画像を元に戻す",
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

    signIn: "ログイン",
    signUp: "新規登録",
    signOut: "ログアウト",
    authEmail: "メールアドレス",
    authPassword: "パスワード",
    authPasswordHint: "8文字以上",
    authHeadIn: "ログインして続ける",
    authHeadUp: "アカウントを作成",
    authToUp: "アカウントがない方はこちら",
    authToIn: "すでにアカウントをお持ちの方",
    authWorking: "処理中...",
    authChecking: "ログイン状態を確認しています...",
    authPrivacy:
      "通帳の画像と読み取り結果は、アップロードしたアカウントにのみ表示されます。同じ端末から別の方がログインしても閲覧できません。",
    authClaimed: (n: number) => `既存のワークスペース${n}件をこのアカウントに移しました。`,
    authAccount: "アカウント",

    saveSaving: "保存中...",
    saveSaved: "保存しました",
    saveFailed: "保存できません",

    dragCopyHint: "ドラッグで複数セル選択 · Ctrl+C でExcelへコピー",
    pickedCells: (n: number) => `${n}セル選択中 — Ctrl+C でコピー`,

    errNotBankbook: (s: string) =>
      `${s ? `「${s}」` : "この画像"}は通帳ではないため読み取れません。ファイルを間違えていないかご確認ください。`,
    errUnreadable: (s: string) =>
      `${s ? `「${s}」` : "この画像"}は不鮮明で読み取れません。もう一度鮮明に撮影・スキャンするか、取引明細の表に寄せてトリミングしてください。`,
    errNoRows: (s: string) =>
      `${s ? `「${s}」` : "この画像"}に取引明細の行がありません（表紙または白紙の可能性があります）。`,

    warp: "台形補正",
    warpApply: "補正を適用",
    warpHint: "丸い4つの角をページに合わせてドラッグ。通帳が平らに開かない場合は辺の中点（四角）で辺を湾曲。下の「縦」「横」スライダーは全体を作り直します",
    warpVert: "縦 — 上下から斜めに撮影した場合",
    warpHorz: "横 — 左右から斜めに撮影した場合",
    warpCorner: (n: number) => `角${n} — ドラッグして調整`,

    errTooLarge: (s: string, size: number, limit: number) =>
      `${s ? `「${s}」` : "この画像"}はサイズが大きすぎます（${size}MB、上限${limit}MB）。画像を小さくしてください。`,

    warpMid: (n: number) => `辺の中点${n} — ドラッグして辺を湾曲（通帳が平らに開かない場合）`,

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
