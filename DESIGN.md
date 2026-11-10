---
name: 通帳スキャン (Tsucho Scan) web app
description: A multi-part business slip in cobalt ink, where one balance chain runs down the ledger and a vermilion seal closes each broken link.
colors:
  page: "#e6ecf5"
  card: "#fbfcfe"
  card-2: "#f1f4fa"
  card-3: "#e4eaf4"
  band: "#f0f4fb"
  ink: "#131b30"
  ink-2: "#414c67"
  ink-3: "#5f6a84"
  rule: "#c5d0e2"
  rule-2: "#dee5f0"
  shell: "#131c36"
  shell-2: "#1e2949"
  shell-3: "#2a3760"
  shell-ink: "#eef2fa"
  shell-ink-2: "#b3bed6"
  shell-rule: "#2f3b5e"
  bench: "#182140"
  accent: "#1f46bc"
  accent-hover: "#17388f"
  accent-pale: "#e2e9fb"
  accent-ink: "#ffffff"
  head: "#1f3478"
  head-ink: "#f1f4fc"
  shu: "#bd392c"
  shu-hover: "#a22f24"
  shu-pale: "#fbe8e4"
  shu-on-ink: "#f08b7d"
  mark: "#c8321f"
  warn-bg: "#fff2cc"
  warn-ink: "#6b4a00"
  warn-edge: "#dfba5c"
  ok-bg: "#c6efce"
  ok-ink: "#17532f"
  ok-edge: "#8ccba0"
  out-ink: "#7a2e22"
  in-ink: "#1c2f6b"
typography:
  display:
    fontFamily: "BIZ UDPGothic, Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.01em"
  headline:
    fontFamily: "BIZ UDPGothic, Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.01em"
  title:
    fontFamily: "BIZ UDPGothic, Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.6
  body:
    fontFamily: "BIZ UDPGothic, Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "BIZ UDPGothic, Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
  data:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Hiragino Kaku Gothic ProN, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tabular-nums lining-nums"
  data-hero:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Hiragino Kaku Gothic ProN, Consolas, monospace"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
    fontFeature: "tabular-nums lining-nums"
rounded:
  xs: "2px"
  md: "3px"
  xl: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-quiet:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  button-seal:
    backgroundColor: "{colors.shu}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  button-seal-hover:
    backgroundColor: "{colors.shu-hover}"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  tag-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "22px"
  tag-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok-ink}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "22px"
  ledger-head:
    backgroundColor: "{colors.head}"
    textColor: "{colors.head-ink}"
    typography: "{typography.label}"
    height: "30px"
  ledger-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    height: "36px"
  dialog:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
---

# Design System: 通帳スキャン web app

## Overview

**Creative North Star: "The Self-Proving Slip"**

The interface borrows the material of a multi-part Japanese business slip: cobalt form ink on a pale blue copy-sheet tint, solid ink head bands, ruled tables with no card shells, and corners cut to 2 to 4px. The world lends type, palette, density and one signature move. Layout, navigation and controls stay ordinary web product conventions, so an accountant never has to learn the chrome.

The signature move is the balance chain: one 2px vertical line runs down every ledger table, each row hangs a node from it, and a broken link stands open as a hollow vermilion ring with a gap in the line above. A person closes it with a 検印 seal. The same chain continues through the page rail, the ledger, the sheet-joining strips and quick review. Depth is ply on ply: a sheet lying on a sheet, nothing else.

The mood is plain, exact and calm. The photo bench is the one dark, detailed surface; the ledger is the one white sheet beside it. Light is the natural theme (office daylight, older eyes); dark follows the device and is a full re-tone, not an inversion.

**Key Characteristics:**
- Cobalt means pressable. Vermilion (朱) means seal, brand or broken link. Yellow and green mean what they mean in the Excel export.
- Square-ish forms: one radius scale, 2px to 4px.
- Digits never truncate; columns size to the longest real string.
- Every size multiplies by `--fs` (1, 1.15, 1.3) so the large-text option works everywhere.
- Motion marks a state change only.

## Colors

A cool paper-and-ink palette with exactly three working hues. All values are CSS custom properties in `web/src/app/globals.css`, re-defined under `[data-theme="dark"]`. The frontmatter holds the light values.

### Primary
- **Form Cobalt** (#1f46bc, dark #7596f7): every pressable thing, focus rings, selected-row outline, drag handle on hover. Hover is #17388f (dark #8fabfa). Pale tint #e2e9fb marks the selected row and hover rows.
- **Slip Head Blue** (#1f3478): the solid head band of every ledger table, with #f1f4fc text. It is a surface, not an action.

### Secondary
- **Seal Vermilion** (#bd392c, dark #ea7566): the brand mark, the 検印 seal, the open chain ring, the break label in joins, danger text, and the seal button that confirms a row. On the dark bench use #f08b7d. Strokes drawn on the photo use the fixed #c8321f because the photo does not change with the theme.

### Tertiary
- **Needs-Look Yellow** (#fff2cc, text #6b4a00, edge #dfba5c): a cell or row a person must check. Equal to the UNCERTAIN fill in the Excel export.
- **Machine-Fixed Green** (#c6efce, text #17532f, edge #8ccba0): a cell the machine corrected. Equal to the FIXED_FILL in the Excel export.

### Neutral
- **Copy-Sheet Tint** (#e6ecf5): page background and the page rail.
- **Fresh Sheet** (#fbfcfe): ledger, dialogs, fields. Alternate rows use #f0f4fb.
- **Form Ink** (#131b30), secondary #414c67, tertiary #5f6a84: text, in three steps. Hairlines are #c5d0e2 and #dee5f0.
- **Shell Ink** (#131c36 with #1e2949 and #2a3760 raised steps) and **Photo Bench** (#182140): the top bar and photo pane stay deep ink in both themes. Text on them is #eef2fa or #b3bed6.
- **Out / In ink** (#7a2e22 / #1c2f6b): お支払 and お預り amounts in quick review only, tonal, never alarm colors.

### Named Rules
**The Pressable Cobalt Rule.** Cobalt appears only where something can be pressed or is focused. Never decorate with it.

**The Excel Parity Rule.** Yellow and green are the Excel file's fills. Do not reuse them for generic success or warning messages, and do not re-tint them.

**The Reserved Vermilion Rule.** Vermilion is the brand, the seal and the broken link. It is not a general error color for decoration; destructive buttons use it because a seal is a commitment.

## Typography

**UI Font:** BIZ UDPGothic (Morisawa universal-design face), then Yu Gothic UI, Hiragino Kaku Gothic ProN, Noto Sans JP.
**Data Font:** Noto Sans JP with tabular, lining numerals (`.num`, `.tnum`). BIZ UDGothic was tried and dropped: its comma takes a full cell, so 88,699 reads as "88, 699".
**Vietnamese:** Be Vietnam Pro leads when `html:lang(vi)` because BIZ lacks the diacritics.
**Seal glyph:** Shippori Antique, used only inside the 検印 seal.

**Character:** A sober gothic for chrome and a number face that lines up in columns. Japanese text breaks by phrase (`word-break: auto-phrase`, `line-break: strict`); headings use proportional kana (`palt`), body does not.

### Hierarchy
- **Display** (700, 36px, 1.4): login showcase headline only.
- **Headline** (700, 28px, 1.4): login headline at smaller widths, hero figures in quick review (the discrepancy amount at 28px).
- **Title** (700, 16px): dialog headers, product name.
- **Body** (400, 14px, 1.6): all running UI text and table cells. Secondary text 13px.
- **Label** (700, 12px, 1.2): table heads, tags, field labels. 12px is the floor, for older eyes.
- **Data** (Noto Sans JP, 14px table, 16 to 22px quick-review fields and arithmetic, tabular): every amount and date. In quick review digits carry hierarchy by scale alone.

Scale steps are `t12 t13 t14 t15 t16 t18 t22 t28 t36`, each `calc(Npx * var(--fs))`.

### Named Rules
**The Column Stays Straight Rule.** Any figure uses `.num` or `.tnum`. A proportional digit in a money column is a bug.

**The Column Names Stay Japanese Rule.** 摘要, 差引残高, お預り金額 and their siblings are shown in Japanese in every language, with a small gloss beside them where needed.

## Layout

The workbench is a four-part grid from 1024px: page rail (184px, 216px from 1280px) | photo bench | 1px splitter | ledger. The ledger takes 62% of the remainder by default, never less than 620px (times `--fs`), and the bench always keeps 220px. Below 1024px the parts stack. Chrome is a 48px ink top bar plus a status bar that states the arithmetic-only caveat.

Ledger geometry is variable-driven on `.ledger-grid`: date, amount and balance columns widen to the longest string actually present (`--c-*` character counts times a 7.8px digit width), so no digit is ever cut. When space runs out, optional columns shrink first (確認メモ collapses to an icon), then the table scrolls horizontally inside its frame with the 行 column and the action column pinned. Container queries at 819, 739 and 479px step the widths down. Rows are 36px tall, the head 30px, the join strip 32px.

Spacing rhythm is tight and slip-like: 4, 6, 8, 12, 20px. Dialogs pad 16 by 20px. On phones dialog controls grow to 40px for fingers.

Short screens (max-height 820px) tighten quick review; the card must fit without scrolling.

## Elevation & Depth

Flat by default, with ply. Tables, rows, the rail and the bench have no shadow. Elevation means a sheet lying on a sheet.

### Shadow Vocabulary
- **Ply** (`box-shadow: 0 1px 2px rgb(19 27 48 / 0.08)`): a raised chip on a tray, the active segment thumb.
- **Lift** (`box-shadow: 0 2px 6px rgb(19 27 48 / 0.1), 0 18px 44px -14px rgb(19 27 48 / 0.34)`): dialogs and the login showcase sheets, the only floating things. Dark theme uses black at 0.5 and 0.75.
- **Inset selection** (`inset 0 1.5px 0 accent` top and bottom, plus the side on the first and last cell): the selected-row ring. Drawn inside the cell so nothing shifts.
- **Double rule** (`border-top: 3px double ink-3`): the block footer of a ledger, like an accounting book.

### Named Rules
**The Ply Rule.** Shadow appears only for a sheet that lies above another sheet (dialog, login sheet). Nothing else is lifted.

**The No-Shift Rule.** Focus, selection, hover actions and the restore button occupy their space or draw inside the cell. Revealing them must not move a neighbor.

## Shapes

One radius scale: 2px for tags, segments, kbd and buttons inside a tray; 3px for buttons, fields and sheets; 4px for dialogs. Corners are cut, not rounded; the circle is reserved for chain nodes and the seal. Tables are ruled, not boxed: 1px hairlines between cells, a solid head band, no outer card shell. The seal is a 2.2px vermilion ring with a Shippori Antique glyph (default 検), tilted -9deg like a hand stamp. The brand mark is a vermilion rounded square with three white bars, the middle one thick, meaning one row picked out on a page.

## Components

### Buttons
- **Shape:** 3px corners, 34px high (28px small, 44px large), 700 weight on primary and seal.
- **Primary:** Form Cobalt fill, white text. One per region.
- **Quiet:** Fresh Sheet fill, rule border, regular weight. **Ghost:** transparent, Ink-2 text, tint on hover. **Danger:** transparent with vermilion text; **danger-solid** and **seal** use the vermilion fill.
- **Seal button:** the review confirmation, vermilion because it stamps a 検印.
- **States:** hover shifts one step; active presses down 1px; disabled is 42% opacity; focus is a 2px cobalt outline (shell ink on dark surfaces). Buttons on ink (`.on-ink`) re-map to the shell palette.

### Fields
- 36px high, 3px corners, Fresh Sheet fill, 1px rule border; hover darkens the border to Ink-3; focus becomes cobalt with a 1px extra ring. Ledger cells fill their cell exactly and show a 2px focus ring inside it. Invalid shows a vermilion pale fill with a 2px danger inset ring. Placeholder uses Ink-3.

### Tags and status
- Flat 22px chips, no border, no dot: neutral (#e4eaf4), warn (yellow), ok (green), shu (pale vermilion).

### Segmented control
- A tray in #e4eaf4 with a Fresh Sheet thumb under the chosen option; chosen text is bold. Used for choose-one groups.

### Dialogs
- Scrim, then a 4px-cornered sheet with Lift shadow, a 52px head with a hairline, scrolling body, and a tinted foot right-aligned with actions. Enters with a 200ms rise of 8px.

### Ledger table (signature)
- Solid Slip Head Blue head, white sheet rows with alternating band, 1px column rules, tabular figures, pinned 行 and action columns, 3px double rule footers with sums under their columns. Row actions are invisible until hover or focus on fine pointers and always present on touch. See the chain below.

### Balance chain (signature)
- A 2px line and a 9px node at x=10px on the first cell of every row. States via `data-link`: `ok` closed dot, `open` hollow 11px vermilion ring with the line starting at the middle, `sealed` vermilion node replaced by the seal, `note` a short dash for 繰越 rows, `first` and `last` half lines. `data-gap` stops the line 10px short of the row above's lower edge and draws a small vermilion bar, a real gap across the row boundary. The same axis is reused in the join strip between sheets and in the page rail.

### Quick review (signature)
- One large card owns the pane for one flagged row. The arithmetic is set like hand calculation: operator, label, figure in three aligned columns, a rule, the expected total, the printed total, a double rule, then the difference (28px bold vermilion when off, green when it matches). Fields are 40px. Cards slide 20px sideways over 180ms; a sealed row holds 200ms so the eye sees the stamp.

### Photo bench
- Flat #182140 with no texture. Range sliders are redrawn as a 2px line with a 10 by 18px ink thumb so the browser default does not clash.

### Navigation
- Ink top bar 48px with brand mark, case and language/theme/settings controls, then the page rail on the tint with thumbnails on the chain. Selected state is the pale cobalt fill with a cobalt outline.

## Do's and Don'ts

### Do:
- **Do** put every amount and date in `.num`/`.tnum` and size columns from the longest real string.
- **Do** keep column headings in the passbook's Japanese in every language.
- **Do** use `var(--...)` tokens and `text-t*` steps so dark theme and `--fs` work for free.
- **Do** draw selection and focus inside the box so layout never shifts.
- **Do** use the seal as the confirmation gesture and press it once, on the row just confirmed.
- **Do** keep every control reachable by keyboard (n/p, Ctrl+Enter, Ctrl+Z) and honor `prefers-reduced-motion` by stopping every animation class.
- **Do** keep yellow and green exactly aligned with the Excel export.

### Don't:
- **Don't** use CSS `zoom` for large text; the photo frame's pointer math depends on real rects. Scale type through `--fs`.
- **Don't** use cobalt, vermilion, yellow or green as decoration.
- **Don't** wrap tables in bordered rounded cards, or radii above 4px.
- **Don't** use a gradient, glow or dotted texture; the one gradient is the fade at the bottom of the empty ledger.
- **Don't** put text below 12px.
- **Don't** use proportional digits in any money or date column.
- **Don't** claim more than the product proves: the balance chain proves arithmetic, not completeness or correct reading.
- **Don't** write client names, contact names or real account numbers in sample data, copy or comments (the repository is public).
