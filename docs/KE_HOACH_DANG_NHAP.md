# Kế hoạch: đăng nhập thật (Google · LINE · email) + giữ cửa «xem thử»

> Lập ngày 25/11/2026. Người quyết: anh Huỳnh Nguyên. Người dẫn kỹ thuật: Claude.
> Mục tiêu: có tài khoản thật, bảo mật thật, NHƯNG công ty/khách Nhật vẫn vào xem sản phẩm được ngay, không bắt đăng ký.

## 0. Quyết định đã chốt (25/11)

| Câu hỏi | Chốt |
|---|---|
| Chế độ «đăng nhập mở» | **Giữ song song**, đổi tên thành «お試し（登録不要）». Có dòng ghi chú rõ «nhập ID/mật khẩu tuỳ ý». Sau khi vào thì **đủ chức năng**, chỉ giới hạn quét thật **5 mặt sổ/ngày**. Sổ mẫu không giới hạn. |
| Gửi email | **Resend** (miễn phí ~3.000 thư/tháng), gửi từ `no-reply@tsucho-scan.com`. |
| Ai được đăng ký | **Ai cũng được**, có hạn mức quét/ngày; anh nâng hạn mức cho khách quen. |
| Cách đăng nhập thật | Google · LINE · email + mật khẩu (xác minh email, quên mật khẩu). |
| Đưa lên mạng | Gộp icon mới + đăng nhập, đưa lên một lượt. |

## 1. Ba loại tài khoản

| `kind` | Tạo bằng | Đăng nhập bằng | Hạn mức quét thật / ngày |
|---|---|---|---|
| `trial` | Ô «お試し»: ID + mật khẩu tuỳ ý | Cũng ô đó | `TSUCHO_TRIAL_SCAN_LIMIT` (mặc định **5**) mỗi tài khoản, **và** `TSUCHO_TRIAL_IP_LIMIT` (mặc định 15) mỗi IP, **và** `TSUCHO_TRIAL_DAILY_TOTAL` (mặc định 100) cho TẤT CẢ tài khoản thử cộng lại — chặn người tạo vô số ID để quét chùa |
| `demo` | Biến `TSUCHO_DEMO_ACCOUNTS` (đã có) | Nút dùng thử chung | như cũ (`TSUCHO_DEMO_SCAN_LIMIT`) |
| `member` | Đăng ký email (đã xác minh), Google, LINE | Email+mật khẩu / Google / LINE | `users.scan_limit` nếu có, không thì `TSUCHO_MEMBER_SCAN_LIMIT` (mặc định 30). `role='admin'` thì không giới hạn |

**Tách không gian tên (chống chiếm chỗ email):** tài khoản `trial` lưu cột `email` = `"trial:" + id`.
Không có tách này thì người lạ tạo ID thử `ten@congty.co.jp` trước, chủ thật của email đó không đăng ký được nữa.
Ô «お試し» luôn tra `"trial:" + id`; ô email thật không bao giờ tra trúng tài khoản thử.

**Admin** từ nay do biến `TSUCHO_ADMIN_EMAILS` (danh sách email, dấu phẩy) quyết định, **bỏ** luật «người đăng ký đầu tiên thành admin»
(mở đăng ký cho cả thiên hạ thì luật đó nguy hiểm trên máy chủ mới). Một `member` đã xác minh có email trong danh sách → `role='admin'`
lúc đăng nhập, và lần đầu thì nhận các hồ sơ chưa có chủ (`workspace.claim_ownerless`, như cũ). Admin không giới hạn quét.

**Không bao giờ tự nối** tài khoản `trial` với Google/LINE/email (ID thử là thứ ai cũng gõ được).

## 2. Dữ liệu (SQLite, `api/auth.py`)

Di trú trong `init_db()` (kiểu `PRAGMA table_info` đã làm với cột `prefs`), chạy được nhiều lần không hỏng:

```sql
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN scan_limit INTEGER;          -- NULL = theo mặc định
CREATE TABLE IF NOT EXISTS identities (                  -- Google / LINE
    provider   TEXT NOT NULL,          -- 'google' | 'line'
    subject    TEXT NOT NULL,          -- 'sub' trong id_token, không đổi suốt đời tài khoản
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS email_tokens (                -- link xác minh / đặt lại mật khẩu
    token_hash TEXT PRIMARY KEY,       -- SHA-256, như sessions
    user_id    TEXT NOT NULL,
    purpose    TEXT NOT NULL,          -- 'verify' | 'reset'
    expires_at REAL NOT NULL,
    used_at    REAL
);
CREATE TABLE IF NOT EXISTS oauth_states (                -- chống giả mạo khi Google/LINE gọi lại
    state      TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    nonce      TEXT NOT NULL,
    verifier   TEXT NOT NULL,          -- PKCE
    next_path  TEXT NOT NULL DEFAULT '/',
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_counters (              -- hạn mức chung: 'u:<id>', 'ip:<ip>', 'trial-all'
    key TEXT NOT NULL, day TEXT NOT NULL, faces INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, day)
);
```

**Phân loại tài khoản CŨ khi di trú** (chỉ chạy một lần, đánh dấu bằng bảng `meta(key,value)` hoặc cột mới vừa thêm):
- email nằm trong `TSUCHO_DEMO_ACCOUNTS` → `kind='demo'`;
- `role='admin'` → `kind='member'`, `email_verified=1`;
- còn lại (tạo bằng đăng nhập mở) → `kind='trial'`, `email = 'trial:' || email`. Người cũ vẫn vào được bằng ô «お試し» với đúng ID + mật khẩu cũ; dữ liệu giữ nguyên (khoá theo `user_id`, không theo email).

`password_hash` của tài khoản chỉ có Google/LINE là `''` → `verify_password` luôn sai (đã đúng sẵn: chuỗi rỗng không tách được).

## 3. API mới (`api/main.py` + mô-đun mới)

Mọi lỗi trả `{"kind": "<mã>", ...}` để giao diện tự dịch (đúng lối `AuthError` hiện có).

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/auth/methods` | `{google: bool, line: bool, email: bool, trial: bool, trial_limit, member_limit}` — nút nào hiện tuỳ máy chủ đã cấu hình khoá chưa |
| POST | `/api/auth/trial` | `{id, password}` → như đăng nhập mở hiện nay nhưng tra/tạo `trial:<id>`, `kind='trial'`. Thay cho nhánh `OPEN_LOGIN` trong `/api/auth/login` |
| POST | `/api/auth/register` | `{email, lang}` (**KHÔNG có mật khẩu** — chống chiếm trước tài khoản: mật khẩu do chủ email tự đặt ở bước `/verify`) → luôn `{ok:true, sent:true}`; tạo `member` chưa xác minh (hash '') nếu chưa có và gửi thư xác minh, **không** tạo phiên. Email đã xác minh rồi: trả **y hệt** (không lộ email nào đã đăng ký) và gửi thư «bạn đã có tài khoản, quên mật khẩu thì bấm đây». Việc tra/tạo/gửi chạy nền nên thời gian trả lời như nhau |
| POST | `/api/auth/login` | chỉ cho `member`/`demo`. Chưa xác minh → 403 `{kind:"unverified"}` (chỉ trả SAU KHI mật khẩu đúng) |
| POST | `/api/auth/verify` | `{token, password}` → kiểm `weak_password` (min 8) / `password_too_long` (max 128) TRƯỚC khi đốt token; rồi đặt mật khẩu, đánh dấu xác minh, huỷ mọi token verify khác, xoá mọi phiên, mở phiên mới, trả user. Token sai/hết hạn/đã dùng → 400 `bad_token` |
| POST | `/api/auth/resend` | `{email, lang}` → token mới cho member chưa xác minh (token cũ bị thay). Luôn 200, việc chạy nền |
| POST | `/api/auth/forgot` | `{email, lang}` → nếu có `member` đã xác minh thì gửi link đặt lại (hạn **30 phút**). Luôn 200 |
| POST | `/api/auth/reset` | `{token, password}` → đổi mật khẩu, **xoá mọi phiên cũ**, đăng nhập |
| GET | `/api/auth/google/start?next=/cases/` | tạo `state`+`nonce`+PKCE, lưu `oauth_states`, chuyển hướng sang Google |
| GET | `/api/auth/google/callback` | đổi `code` lấy token, kiểm `id_token`, nối/tạo tài khoản, đặt cookie, chuyển hướng về `next` |
| GET | `/api/auth/line/start`, `/api/auth/line/callback` | như trên với LINE |
| GET | `/api/auth/me` | thêm `kind`, `email_verified`, `display_name`, `providers: [...]`, `quota: {limit, used, left}` |

**Hạn mức gửi thư** (bảng `usage_counters`, khoá theo giờ): mỗi (mục đích `verify`/`reset`/`exists`, email) 3 thư/giờ — tách theo mục đích để spam /register không chặn được thư đặt lại mật khẩu — và mỗi IP 10 thư/giờ. Vượt thì im lặng không gửi (vẫn trả 200). Mọi khoá theo IP gom IPv6 về /64 (`auth.ip_bucket`).
**Hạn mức quét**: ngoài khoá riêng từng loại tài khoản còn khoá toàn cục `all-real` (`TSUCHO_GLOBAL_DAILY_SCANS`, mặc định 300) cho mọi tài khoản không phải admin (scope `all`); trial mới tối đa `TSUCHO_TRIAL_NEW_PER_IP` (10)/IP/ngày (429 `trial_new_limit`).
**Header bảo mật** mọi phản hồi: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`; `/verify/ /reset/ /forgot/` thêm `Cache-Control: no-store`. Mọi POST/PUT/PATCH/DELETE dưới `/api/` kiểm `Origin` (localhost chỉ khi `TSUCHO_PUBLIC_URL` không đặt hoặc là localhost).
**Đợt B**: luật nối tài khoản OAuth PHẢI bỏ qua tài khoản `users.legacy=1` (admin cũ có email do người ta tự gõ, chưa chứng minh).

### 3.1 Google (OpenID Connect, luồng mã + PKCE)
- Xin quyền: `scope=openid email profile`, `response_type=code`, `code_challenge_method=S256`, `nonce`, `state`, `prompt=select_account`.
- Đổi mã: `POST https://oauth2.googleapis.com/token` (client_id, client_secret, code, code_verifier, redirect_uri, grant_type=authorization_code).
- `id_token` lấy **trực tiếp từ Google qua HTTPS** thì theo tài liệu Google không bắt buộc kiểm chữ ký; vẫn PHẢI kiểm: `iss ∈ {accounts.google.com, https://accounts.google.com}`, `aud == GOOGLE_CLIENT_ID`, `exp > now`, `nonce` khớp, `email_verified == true`.
- Gọi HTTP bằng `urllib.request` (stdlib, không thêm thư viện), gói trong MỘT hàm `_post_form(url, data) -> dict` để test thay được.

### 3.2 LINE Login v2.1
- `https://access.line.me/oauth2/v2.1/authorize`, `scope=openid profile email`, PKCE + `nonce` + `state`.
- Đổi mã: `POST https://api.line.me/oauth2/v2.1/token`.
- Kiểm `id_token` bằng API chính thức `POST https://api.line.me/oauth2/v2.1/verify` (`id_token`, `client_id`, `nonce`) — khỏi tự kiểm chữ ký.
- `email` chỉ có khi kênh LINE đã được **duyệt quyền lấy email** (anh xin trong LINE Developers). Không có email vẫn đăng nhập được: tài khoản nhận diện bằng `sub`.

### 3.3 Quy tắc nối tài khoản (quan trọng cho bảo mật) — đã làm ở `auth.login_with_identity`
1. Đã có `identities(provider, sub)` → đăng nhập tài khoản đó (cập nhật email trong identities nếu đổi).
2. Chỉ **Google** (`email_verified=true`): có `member` **đã xác minh**, `legacy=0`, cùng email → nối vào tài khoản đó.
   **Email LINE không dùng để nối hay nâng admin** (chỉ lưu vào `identities.email` để hiển thị).
3. Còn lại → tạo `member` mới: `email` = email Google nếu CHƯA ai dùng (và `email_verified=1`); ngược lại `google:<sub>` / `line:<sub>` (`email_verified=0`, `password_hash=''`).
   Member **chưa xác minh** cùng email mà còn trống (không mật khẩu, phiên, nhà cung cấp, hồ sơ) bị **xoá** để nhường email cho người chứng minh được email qua Google; nếu đã có dữ liệu thì dùng `google:<sub>`.
4. Không bao giờ nối vào `trial`/`demo`/`legacy=1`/`member` chưa xác minh (kẻ xấu đăng ký trước bằng email người khác rồi chờ chủ thật đăng nhập Google).
5. Hiển thị tài khoản `google:`/`line:`: `email` trả ra là email nhà cung cấp, không có thì tên, không có thì «Google»/«LINE».
6. Lỗi callback luôn 302 về `/login/?auth_error=<cancelled|state|email_unverified|provider>`.

### 3.4 Chống lỗ hổng thường gặp
- `next` chỉ nhận đường dẫn nội bộ: bắt đầu bằng `/`, không bắt đầu `//` hay `/\`, không chứa `://` — sai thì `/`.
- `state` dùng một lần, hết hạn 10 phút, xoá ngay khi dùng; thêm cookie `tsucho_oauth` (HttpOnly, SameSite=Lax, 10 phút) chứa `state` để chắc người bấm «đăng nhập Google» và người quay về là cùng một trình duyệt.
- Token thư (xác minh/đặt lại) 32 byte ngẫu nhiên, lưu băm SHA-256, dùng một lần.
- Đặt lại mật khẩu → xoá mọi phiên của người đó.
- Các POST đổi trạng thái: kiểm header `Origin` (nếu có) phải trùng `TSUCHO_PUBLIC_URL` hoặc localhost lúc phát triển.

## 4. Gửi thư (`api/mailer.py` mới)

- Có `RESEND_API_KEY` → `POST https://api.resend.com/emails` (Bearer), `from = TSUCHO_MAIL_FROM` (mặc định `通帳スキャン <no-reply@tsucho-scan.com>`).
- KHÔNG có khoá (máy phát triển, test) → ghi thư ra `DATA_DIR/outbox/<thời gian>-<mục đích>.txt` và log một dòng. Test đọc thư ở đây.
- Mẫu thư 3 thứ tiếng (ja mặc định / vi / en), chữ thuần + HTML đơn giản. Link: `TSUCHO_PUBLIC_URL + "/verify/#token=..."` / `"/reset/#token=..."` — token nằm SAU dấu `#` nên không vào access log và không vào Referer.
- Gửi trong luồng nền (không bắt người dùng chờ Resend trả lời); lỗi gửi chỉ ghi log.

## 5. Giao diện (`web/`)

Trang `/login/` làm lại khung bên phải (khung trưng bày bên trái giữ nguyên):

```
 ┌──────────────────────────────────────┐
 │  [G] Googleでログイン                │   ← chỉ hiện khi methods.google
 │  [LINE] LINEでログイン               │   ← nút xanh #06C755 theo quy định thương hiệu LINE
 │  ─────── またはメールアドレス ───────  │
 │  [ログイン] [新規登録]  (2 thẻ)       │
 │  メール / パスワード / 👁             │
 │  パスワードをお忘れの方               │
 ├──────────────────────────────────────┤
 │  お試し（登録不要）                   │   ← khung riêng, nền giấy nhạt
 │  任意のIDとパスワードで入れます。      │
 │  すべての機能が使えます。実際の読み取り │
 │  は1日5ページまで（サンプル通帳は無制限）│
 │  ID / パスワード / [試してみる]        │
 └──────────────────────────────────────┘
```

Trang mới (xuất tĩnh, đọc `#token=` phía trình duyệt rồi xoá khỏi thanh địa chỉ): `/verify/`, `/reset/`, `/forgot/`.
Sau khi đăng ký: màn «確認メールを送りました» + nút gửi lại (đếm ngược 60 giây).
Tài khoản `trial`: dải nhỏ trên cùng «お試しアカウント・本日あと N ページ読み取れます ・ [無料登録]». Không chặn chức năng nào khác.
Mọi chữ mới thêm vào `lib/i18n.tsx` đủ ja / vi / en.
Nút Google theo hướng dẫn thương hiệu Google (logo «G» 4 màu, chữ «Googleでログイン»). Nút LINE dùng ảnh chính thức tải từ trang LINE Developers.

## 6. Trang pháp lý (bắt buộc cho Google + LINE)

Trên trang giới thiệu: `tsucho-scan.com/privacy/` (プライバシーポリシー) và `tsucho-scan.com/terms/` (利用規約).
Claude viết bản nháp tiếng Nhật trung thực (dữ liệu nằm ở đâu, Gemini xử lý, xoá thế nào, liên hệ contact@).
**Anh phải duyệt; nếu làm ăn thật nên nhờ người có chuyên môn pháp lý Nhật xem lại.** Trang đăng nhập có link tới hai trang này.

## 7. Cấu hình (`C:\TsuchoScan\config.env` trên laptop, `.env` trên máy phát triển)

```
TSUCHO_PUBLIC_URL=https://app.tsucho-scan.com
GOOGLE_CLIENT_ID=...            GOOGLE_CLIENT_SECRET=...
LINE_CHANNEL_ID=...             LINE_CHANNEL_SECRET=...
RESEND_API_KEY=...              TSUCHO_MAIL_FROM=通帳スキャン <no-reply@tsucho-scan.com>
TSUCHO_TRIAL_SCAN_LIMIT=5       TSUCHO_TRIAL_IP_LIMIT=15      TSUCHO_TRIAL_DAILY_TOTAL=100
TSUCHO_MEMBER_SCAN_LIMIT=30
```
Thiếu khoá nào thì nút tương ứng tự ẩn — app không sập. Nâng hạn mức một người: `python tools/han-muc.py ten@congty.jp 200` (script mới, chạy trên laptop).

## 8. Việc ANH làm (song song lúc Claude viết code; Claude hướng dẫn từng bước khi tới)

1. **Google Cloud** (~15 phút): tạo dự án `tsucho-scan` → màn hình đồng ý OAuth (External, tên 通帳スキャン, email hỗ trợ, tên miền `tsucho-scan.com`, link privacy/terms) → Credentials → OAuth client ID (Web) với 2 địa chỉ quay về:
   `https://app.tsucho-scan.com/api/auth/google/callback` và `http://localhost:8000/api/auth/google/callback`. Chỉ xin `openid email profile` nên **không cần Google thẩm định**, chuyển «In production» là xong.
2. **LINE Developers** (~20 phút + chờ duyệt quyền email): tạo Provider → kênh **LINE Login** → Callback URL như trên (đổi `google` thành `line`) → xin quyền email (cần ảnh chụp trang privacy).
3. **Resend** (~10 phút): đăng ký → thêm tên miền `tsucho-scan.com` → bấm cho Resend tự thêm bản ghi DNS vào Cloudflare → tạo API key quyền «Sending access».
4. Dán các khoá vào `config.env` trên laptop (tự tay, **không gửi vào chat**).

## 9. Thứ tự làm & ai làm

| Đợt | Việc | File | Người làm |
|---|---|---|---|
| A | CSDL + di trú + 3 loại tài khoản + hạn mức chung + `/trial` + email đăng ký/xác minh/quên/đặt lại + `mailer.py` + `/methods` + `/me` mở rộng | `api/auth.py`, `api/demo.py`→`api/quota.py`, `api/mailer.py`, `api/main.py` (phần auth), `tests/test_api_auth*.py` | Thợ backend |
| B | Google + LINE (start/callback, nối tài khoản) | `api/oauth.py` mới, `api/main.py`, `tests/test_oauth.py` | Thợ backend (sau A) |
| C | Trang đăng nhập mới, `/verify` `/reset` `/forgot`, dải hạn mức, i18n | `web/src/app/login/*`, `web/src/app/{verify,reset,forgot}/*`, `web/src/lib/{api,auth,i18n}.tsx`, E2E | Thợ frontend (song song A, theo hợp đồng API ở §3) |
| D | Trang privacy/terms trên trang giới thiệu | `tsucho-scan-homepage` | Claude viết nháp, anh duyệt |
| E | Kiểm cuối: pytest, npm test, tsc, E2E, bấm thử thật cả 3 cách; rồi commit + đưa lên laptop + trang giới thiệu | — | Claude |

Thước đo xong: đăng nhập Google/LINE/email chạy thật trên `app.tsucho-scan.com`; ô «お試し» vẫn vào được và bị chặn đúng ở mặt thứ 6; người cũ vẫn vào được bằng ID cũ; không test nào cũ bị hỏng.
