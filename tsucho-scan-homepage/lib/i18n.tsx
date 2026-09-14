'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/* Nội dung trang chủ, ba thứ tiếng.
 *
 * LUẬT: chỉ viết những gì ứng dụng LÀM ĐƯỢC THẬT. Bản trước hứa "tự động
 * 仕訳・分類" và "月次サマリーレポート" — ứng dụng không có hai thứ đó. Hứa
 * quá rồi bị phát hiện thì mất cả niềm tin vào những phần đúng.
 *
 * Con số trong mục `limits` lấy từ đo đạc thật (docs/TRIEN_KHAI.md), không
 * làm tròn cho đẹp.
 */

export type Lang = 'jp' | 'vn' | 'en'

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'jp', label: '日本語', short: 'JA' },
  { code: 'vn', label: 'Tiếng Việt', short: 'VI' },
  { code: 'en', label: 'English', short: 'EN' },
]

const HTML_LANG: Record<Lang, string> = { jp: 'ja', vn: 'vi', en: 'en' }

const DICT = {
  jp: {
    nav: {
      reads: '読み取れるもの',
      verify: '検算',
      how: '進め方',
      screen: '作業画面',
      output: '出力ファイル',
      limits: '精度',
      pricing: '料金',
      faq: 'よくある質問',
      login: 'ログイン',
      start: '試してみる',
      menu: 'メニュー',
    },
    hero: {
      title: '通帳の明細を、\n検算済みの表へ。',
      lead:
        '通帳の写真やPDFを読み取り、Excel／CSVに書き出します。全行を残高チェーンで検算し、機械が迷った箇所だけを黄色で示します。人が直すのは、その数行だけです。',
      primary: '通帳を読み取ってみる',
      secondary: '何が読めるのか見る',
      note: '見本の通帳で試せます。実際の通帳を出す前に動きが確認できます。',
      demoPrinted: '通帳の印字',
      demoRead: '読み取り結果',
      demoChain: '残高チェーン',
      demoSeal: '検算済',
      demoHint: '表の行を選ぶと、写真の同じ行に赤い帯がつきます。最終行は手書きですが、取引ではない注記として正しく拾っています。',
      tagNote: '注記',
      col: {
        no: '行',
        date: '年月日',
        desc: '摘要',
        out: 'お支払金額',
        in: 'お預り金額',
        bal: '差引残高',
      },
    },
    reads: {
      title: '通帳は一冊ごとに違う。そこが難しいところです。',
      lead:
        '同じ「通帳」でも、銀行ごとに列の並びも記号も違います。実際の通帳で何度もつまずいて、そのたびに直してきた箇所です。',
      items: [
        {
          title: '列の並びが逆の通帳',
          body:
            'ゆうちょの「通常貯金（兼お借入明細）」は、お預り金額がお支払金額より左に来ます。列見出しを読んでから割り当てるので、思い込みで入出金が逆になりません。',
          sample: '年月日｜取扱店｜お預り金額｜お支払金額｜現在高',
        },
        {
          title: 'ページ下部の記号の凡例',
          body:
            '「K,M…入金 / L…振替入金 / Q…支払い / R…振替支払い」のような凡例がページ下に印刷されていることがあります。推測せず、その通帳に書かれた通りに従います。',
          sample: 'K,M…入金　L…振替入金　Q…支払い',
        },
        {
          title: '大書きのカナをそのまま',
          body:
            '通帳は「シヤ」「フイ」のように大きなカナで印字します。現代表記の「シャ」「ファ」に直すと、振込先の照合ができなくなります。印字のまま写します。',
          sample: 'シンセイフイナンシヤル',
        },
        {
          title: '1桁の年号',
          body:
            '「7-04-30」は令和7年4月30日。先頭の年を落とすと日付が丸ごとずれます。桁数の違う通帳も正しく読みます。',
          sample: '7-04-30 → 令和7年4月30日',
        },
        {
          title: '行番号で抜けを検出',
          body:
            '多くの通帳は左端に01〜24の連番が薄く印字されています。これを読むことで、行を飛ばして読んでいないかを確認できます。',
          sample: '01 02 03 … 24',
        },
        {
          title: '取引ではない行',
          body:
            '「繰越」「未記帳」「新通帳へ繰越しました」は取引ではありません。金額欄を空のまま注記として残すので、合計が狂いません。',
          sample: '新通帳に繰越',
        },
        {
          title: '1枚に複数の通帳',
          body:
            '表紙と明細ページが一緒に写っていても、口座ごとに分けて出力します。隣の通帳の銀行名を取り違えることもありません。',
          sample: '口座A ／ 口座B',
        },
        {
          title: '折り目をまたぐページ',
          body:
            '見開きの真ん中に折り目や隙間があっても、列の構成と残高が続いていれば同じ口座の続きとして扱います。',
          sample: '上段 → 折り目 → 下段',
        },
      ],
    },
    verify: {
      title: '数字が合っているかは、通帳自身が知っています。',
      lead:
        '通帳の各行には前の残高との関係が必ず成り立ちます。この関係を全行で確かめるのが残高チェーンです。読み取りが正しいかどうかを、人が電卓を叩かずに機械が確かめます。',
      formula: '前の残高 − お支払 ＋ お預り ＝ その行の残高',
      workedLabel: '見本の通帳から、続いた3行',
      tick: '一致',
      levelsTitle: '書き出したExcelには、検算の結果がそのまま入ります',
      levels: [
        { label: '残高チェーン検証済', note: '全行が計算どおり。数字はそのまま使えます。' },
        { label: '一部未検証', note: '合わない行だけを指し示します。何行あるかも出ます。' },
        { label: '未検証', note: '残高が読み取れず検算できなかった場合です。' },
      ],
      yellowTitle: '黄色は「機械が自信を持てなかった箇所」',
      yellowExplainLabel: '黄色いセルの見え方',
      yellowExplain: '残高チェーンが合わない行は、こうして黄色になります。写真と見比べて数字を直すと、その行から下の残高が自動で計算し直されます。',
      yellowBody:
        '合わない箇所は黄色いセルになります。写真と見比べてその場で直せば、残高はその行から自動で計算し直します。',
      caveatTitle: '検算にできないこと',
      caveatBody:
        '残高チェーンが示すのは数字どうしの整合性だけです。行がまるごと抜けている場合や、振込先のカナを読み違えた場合は検出できません。そこは目で見る必要があります。',
    },
    how: {
      title: '進め方',
      lead: '設定はありません。読み込ませて、直して、書き出すだけです。',
      steps: [
        {
          title: '通帳を取り込む',
          body: '写真でもPDFでも。複数ページのPDFは1面ずつ自動で分かれます。',
        },
        {
          title: '写真を整える',
          body:
            '斜めから撮った写真は、四隅を合わせれば四角く直せます。まっすぐな写真ほど読み取りは正確です。',
        },
        {
          title: '読み取る',
          body: '選んだ面だけを読み取ります。1面あたり数秒から十数秒です。',
        },
        {
          title: '黄色い箇所を直す',
          body:
            '表の行を選ぶと写真の同じ行に赤い帯がつきます。見比べて直すだけ。矢印キーでセルを移動できます。',
        },
        {
          title: 'Excel／CSVに書き出す',
          body: '通帳の面ごとに分けるか、1つの表にまとめるかを選べます。',
        },
      ],
    },
    tools: {
      title: '写真がまっすぐなほど、読み取りは正確になります',
      lead: 'だから画像を直す道具を、読み取りの前に置いてあります。',
      items: [
        { title: '台形補正', body: '四隅を引っぱってページの形に合わせます。開いた通帳のたわみは、辺の中点を引けば曲げられます。' },
        { title: '切り抜き', body: '表紙や見出しを切り落とすと、行の位置がより正確に合います。' },
        { title: '回転', body: '横向きに撮った通帳は90度単位で回せます。傾きは1度単位で微調整できます。' },
        { title: '明るさ・コントラスト', body: '薄い印字や影のある写真を見やすくしてから読み取れます。' },
      ],
    },
    limits: {
      title: '精度について、先にお伝えします',
      lead:
        '100%とは言いません。実際に測った数字はこうです。先に知っておけば道具として使えますが、隠されていれば不具合になります。',
      rows: [
        { metric: '金額・残高', value: '93〜100%', note: '残高チェーンで裏づけが取れる部分です' },
        { metric: '振込先のカナ', value: '60〜95%', note: '検算では守れません。目で見る必要があります' },
        { metric: '1ページの時間', value: '数秒〜十数秒', note: '通帳の面数だけ並べて処理します' },
      ],
      notDoTitle: 'できないこと',
      notDo: [
        '勘定科目の自動仕訳はしません。通帳に印字された区分をそのまま写します。',
        '月次レポートの作成はしません。合計と残高までです。',
        '会計ソフトへの直接連携はありません。Excel／CSVを書き出して取り込んでください。',
      ],
      value:
        'この道具の値打ちは、全部を正確に読むことではなく、確かめるべき場所を正確に指すことにあります。',
    },
    excel: {
      title: '書き出したファイルは、こう届きます',
      lead:
        'Excelで開いたときの見た目そのままです。検算の結果も、黄色の印も、ファイルの中に入ったまま届きます。',
      formulaBar: '残高チェーン検証済（全行一致）',
      bankLabel: '銀行名',
      bankValue: 'ゆうちょ銀行',
      verifyLabel: '検証',
      verifyValue: '残高チェーン検証済（全行一致）',
      colDate: '年月日',
      colDesc: '摘要',
      colOut: 'お支払金額',
      colIn: 'お預り金額',
      colBal: '差引残高',
      sheetName: '通帳①',
      sheetName2: '通帳②',
      points: [
        {
          t: '検算の結果がファイルに残る',
          d: '2行目に検証レベルが入ります。半年後に開いても、その明細が検算済みかどうかが分かります。',
        },
        {
          t: '黄色の印もそのまま',
          d: '機械が迷ったセルは黄色のまま書き出されます。Excelで開いて、そこだけ見れば済みます。',
        },
        {
          t: '注記行は金額欄が空',
          d: '「繰越」などの行は金額を空にしてあるので、SUMで合計しても数字が狂いません。',
        },
      ],
    },
    app: {
      title: '実際の作業画面',
      lead:
        'これは作った絵ではなく、動いている画面をそのまま写したものです。左に通帳の面、真ん中に写真、右に読み取り結果。表の行を選ぶと写真の同じ行に赤い帯がつくので、見比べながらその場で直せます。',
      shotAlt: '通帳スキャンの作業画面。左に読み取り済みの通帳の面、中央に通帳の写真、右に読み取り結果の表。',
      marks: [
        { x: 34, y: 39, text: '写真の同じ行に赤い帯' },
        { x: 89, y: 33.5, text: '全行 検算OK' },
        { x: 96, y: 89, text: '合計と最終残高' },
      ],
      caption: 'ブラウザだけで動きます。インストールは要りません。画面は見本の通帳で、会社名は差し替えてあります。',
    },
    pricing: {
      title: 'スモールスタートできる料金プラン',
      lead:
        '機能はどのプランでも同じです。違うのは、月に読める面数と、読み取ったファイルを預かる期間だけ。少ない月は少なく、決算期だけ増やす、という使い方ができます。',
      badge: '準備中・予定価格',
      note: '価格はまだ確定していません。ここに出ている数字は検討中のもので、提供開始時に変わることがあります。',
      rowWho: 'こんな方に',
      rowPrice: '月額',
      rowPages: '読み取り面数',
      rowPer: '1面あたり',
      rowKeep: 'ファイルの保存',
      rowFeat: '機能',
      featAll: 'すべて',
      best: 'ふつうはこれ',
      plans: [
        { name: 'おためし', price: '¥0', pages: '20面／月', per: '—', keep: '7日', who: 'まず動きを確かめたい方' },
        { name: '実務', price: '¥2,000', pages: '300面／月', per: '約¥6.7', keep: '90日', who: '毎月の記帳がある事業者' },
        { name: '事務所', price: '¥6,000', pages: '1,500面／月', per: '約¥4.0', keep: '1年', who: '顧問先の通帳をまとめて扱う事務所' },
      ],
      featTitle: 'どのプランにも入っているもの',
      feats: [
        'Excel／CSVへの書き出し',
        '全行の残高チェーン検算',
        '台形補正・切り抜き・回転・明るさ',
        '複数ページPDFの自動分割',
        '面ごと／1つの表にまとめる',
      ],
      ask: '面数が足りないときや、もっと大きな量をお考えのときはご相談ください。',
    },
    explains: {
      chain: {
        label: '残高チェーンの実例',
        body: '前の行の残高から、その行の出金を引き入金を足すと、その行の残高になります。1行でも読み違えれば合わなくなるので、全行が合えば数字は信用できます。',
      },
      kana: {
        label: '大書きのカナとは',
        body: '通帳の印字は昔ながらの大きなカナです。現代表記に直してしまうと、振込記録との突き合わせができなくなります。',
      },
      rowno: {
        label: '行番号はどこに',
        body: '多くの通帳は左端に01〜24の連番が薄く印字されています。この番号を読むことで、行を飛ばして読んでいないか確認できます。',
      },
      katakana: {
        label: 'なぜカナは難しいのか',
        body: 'カナは残高チェーンで裏づけが取れません。金額は前後の行と計算が合うかで確かめられますが、社名の読み違いは計算に影響しないので機械には気づけません。黄色の印も付きませんので、目で見てください。',
      },
      level: {
        label: '3つの検証レベル',
        body: 'ファイルの2行目に、この3つのどれかが入ります。',
      },
    },
    faq: {
      title: 'よくある質問',
      items: [
        {
          q: 'どの銀行の通帳に対応していますか？',
          a: 'ゆうちょ銀行、福岡銀行、徳島大正銀行、西日本シティ銀行など、実際の通帳で確認しながら作っています。列見出しから読み取る仕組みなので、載っていない銀行でも読めることが多いです。まず見本か1ページで試してみてください。',
        },
        {
          q: '対応しているファイル形式は？',
          a: 'PNG・JPG・WEBPの画像と、PDFです。複数ページのPDFは1面ずつ自動で分かれ、面ごとに読み取りや修正ができます。',
        },
        {
          q: '手書きの行も読めますか？',
          a: '「新通帳に繰越」のような手書きの注記は取引ではない行として残します。手書きの金額そのものは印字より精度が落ちますので、黄色い箇所を確認してください。',
        },
        {
          q: '通帳の画像はどこへ行きますか？',
          a: '画像はサーバーに保存され、読み取りのためにAIへ送られます。アカウントごとにデータは分かれており、他の利用者からは見えません。有料プランでは送った内容が学習に使われません。',
        },
        {
          q: '無料で試せますか？',
          a: 'はい。見本の通帳で全体の流れを試せます（AIを呼ばないので費用はかかりません）。実際の通帳も、無料枠の範囲であれば費用はかかりません。',
        },
        {
          q: '同じページを読み直すと、また費用がかかりますか？',
          a: '画像を何も変えていなければ結果を再利用するので費用はかかりません。回転や切り抜きをすると画像そのものが変わるため、読み直しになります。',
        },
      ],
    },
    cta: {
      title: '手元の通帳で、1ページだけ試してみてください',
      lead: '見本の通帳なら費用はかかりません。動きを見てから、実際の通帳を出すか決められます。',
      button: '読み取りを始める',
    },
    footer: {
      tagline: '通帳の明細を、検算済みの表に。',
      product: 'アプリを開く',
      langLabel: '表示言語',
      rights: '通帳スキャン',
    },
  },

  vn: {
    nav: {
      reads: 'Đọc được gì',
      verify: 'Kiểm chứng',
      how: 'Cách làm',
      screen: 'Màn hình',
      output: 'File nhận về',
      limits: 'Độ chính xác',
      pricing: 'Bảng giá',
      faq: 'Hỏi đáp',
      login: 'Đăng nhập',
      start: 'Dùng thử',
      menu: 'Menu',
    },
    hero: {
      title: 'Sổ ngân hàng Nhật,\nthành bảng đã kiểm chứng.',
      lead:
        'Đọc ảnh hoặc PDF sổ ngân hàng rồi xuất ra Excel / CSV. Mọi dòng đều được kiểm bằng chuỗi số dư, chỗ nào máy không chắc thì bôi vàng. Anh chị chỉ phải soát đúng mấy dòng đó.',
      primary: 'Quét thử một mặt sổ',
      secondary: 'Xem nó đọc được gì',
      note: 'Có sổ mẫu để thử trước, không cần đưa sổ thật lên ngay.',
      demoPrinted: 'Chữ in trên sổ',
      demoRead: 'Kết quả đọc',
      demoChain: 'Chuỗi số dư',
      demoSeal: 'Đã kiểm',
      demoHint: 'Bấm một dòng trong bảng, ảnh sẽ hiện vệt đỏ ở đúng dòng đó. Dòng cuối là chữ VIẾT TAY — máy vẫn đọc đúng và xếp nó là ghi chú, không phải giao dịch.',
      tagNote: 'ghi chú',
      col: {
        no: 'Dòng',
        date: 'Ngày',
        desc: 'Nội dung',
        out: 'Tiền ra',
        in: 'Tiền vào',
        bal: 'Số dư',
      },
    },
    reads: {
      title: 'Mỗi cuốn sổ một kiểu. Đó mới là chỗ khó.',
      lead:
        'Cùng gọi là sổ ngân hàng, nhưng mỗi ngân hàng xếp cột một khác, ký hiệu một khác. Đây là những chỗ đã vấp trên sổ thật rồi sửa lại.',
      items: [
        {
          title: 'Sổ có cột xếp ngược',
          body:
            'Sổ ゆうちょ đặt cột tiền VÀO bên trái cột tiền RA — ngược với phần lớn sổ khác. Máy đọc tiêu đề cột trước rồi mới gán, nên không bị đảo thu chi vì đoán mò.',
          sample: 'Ngày｜Chi nhánh｜Tiền vào｜Tiền ra｜Số dư',
        },
        {
          title: 'Bảng ký hiệu in ở chân trang',
          body:
            'Nhiều sổ in chú giải kiểu「K,M…tiền vào / L…chuyển vào / Q…chi / R…chuyển chi」ở cuối trang. Máy đọc đúng bảng đó của từng cuốn chứ không áp luật chung.',
          sample: 'K,M…vào　L…chuyển vào　Q…chi',
        },
        {
          title: 'Katakana chữ to giữ nguyên',
          body:
            'Sổ in chữ to「シヤ」「フイ」. Sửa thành「シャ」「ファ」cho đúng chính tả hiện đại là không đối chiếu được với chứng từ nữa. Máy chép nguyên như in.',
          sample: 'シンセイフイナンシヤル',
        },
        {
          title: 'Năm viết một chữ số',
          body:
            '「7-04-30」là ngày 30/04 năm Lệnh Hoà 7. Rơi mất số năm đầu là sai cả ngày. Sổ viết mấy chữ số cũng đọc đúng.',
          sample: '7-04-30 → Lệnh Hoà 7',
        },
        {
          title: 'Số thứ tự dòng để dò sót',
          body:
            'Phần lớn sổ in mờ số 01–24 ở lề trái. Đọc được số đó thì biết máy có bỏ sót dòng nào không.',
          sample: '01 02 03 … 24',
        },
        {
          title: 'Dòng không phải giao dịch',
          body:
            '「繰越」(chuyển sang), 「未記帳」(chưa ghi sổ) không phải giao dịch. Máy giữ lại làm ghi chú và để trống ô tiền, nên tổng không bị sai.',
          sample: 'Chuyển sang sổ mới',
        },
        {
          title: 'Một ảnh có nhiều sổ',
          body:
            'Ảnh chụp cả bìa lẫn trang giao dịch vẫn được tách theo từng tài khoản, không gán nhầm tên ngân hàng của cuốn nằm bên cạnh.',
          sample: 'Tài khoản A ／ Tài khoản B',
        },
        {
          title: 'Trang có nếp gấp',
          body:
            'Sổ mở đôi có nếp gấp hoặc khoảng trắng ở giữa; nếu cột và số dư vẫn nối tiếp thì đó vẫn là một tài khoản.',
          sample: 'Nửa trên → nếp gấp → nửa dưới',
        },
      ],
    },
    verify: {
      title: 'Số có đúng hay không, chính cuốn sổ biết.',
      lead:
        'Mỗi dòng sổ luôn có một quan hệ với dòng trên. Kiểm quan hệ đó trên toàn bộ các dòng gọi là chuỗi số dư — máy tự chứng minh nó đọc đúng, anh chị không phải bấm máy tính.',
      formula: 'Số dư trước − tiền ra + tiền vào = số dư dòng này',
      workedLabel: 'Ba dòng liền nhau, lấy từ sổ mẫu',
      tick: 'khớp',
      levelsTitle: 'File Excel xuất ra ghi luôn kết quả kiểm chứng',
      levels: [
        { label: 'Đã kiểm toàn bộ chuỗi', note: 'Mọi dòng khớp phép tính. Số dùng được ngay.' },
        { label: 'Kiểm được một phần', note: 'Chỉ ra đúng những dòng chưa khớp, kèm số lượng.' },
        { label: 'Chưa kiểm được', note: 'Không đọc được cột số dư nên không kiểm chứng được.' },
      ],
      yellowTitle: 'Màu vàng là chỗ máy không chắc',
      yellowExplainLabel: 'Ô vàng trông thế nào',
      yellowExplain: 'Dòng nào chuỗi số dư không khớp thì ô sẽ vàng lên như thế này. So với ảnh rồi sửa số, số dư từ dòng đó trở xuống tự tính lại.',
      yellowBody:
        'Ô nào chưa khớp thì bôi vàng. So với ảnh rồi sửa thẳng trong ô, số dư từ dòng đó trở đi tự tính lại.',
      caveatTitle: 'Chuỗi số dư KHÔNG làm được gì',
      caveatBody:
        'Nó chỉ chứng minh các con số khớp nhau. Một dòng bị bỏ sót hẳn, hay tên đối tác katakana đọc sai — hai lỗi đó nó không phát hiện được, vẫn phải soát bằng mắt.',
    },
    how: {
      title: 'Cách làm',
      lead: 'Không có gì phải cài đặt. Đưa ảnh vào, soát lại, xuất file.',
      steps: [
        { title: 'Đưa sổ vào', body: 'Ảnh chụp hay PDF đều được. PDF nhiều trang tự tách thành từng mặt sổ.' },
        {
          title: 'Nắn lại ảnh',
          body: 'Chụp chếch thì kéo bốn góc cho khớp mép trang. Ảnh càng thẳng máy đọc càng đúng.',
        },
        { title: 'Quét', body: 'Chỉ quét những mặt đã chọn. Mỗi mặt mất vài giây tới hơn chục giây.' },
        {
          title: 'Soát chỗ vàng',
          body: 'Bấm một dòng trong bảng là ảnh hiện vệt đỏ ở đúng dòng đó. Nhìn rồi sửa, phím mũi tên đi giữa các ô.',
        },
        { title: 'Xuất Excel / CSV', body: 'Chọn tách theo từng mặt sổ, hoặc gộp tất cả vào một bảng.' },
      ],
    },
    tools: {
      title: 'Ảnh càng thẳng, máy đọc càng đúng',
      lead: 'Nên bộ công cụ chỉnh ảnh nằm ngay trước bước quét.',
      items: [
        { title: 'Nắn phối cảnh', body: 'Kéo bốn góc cho khớp mép trang. Sổ mở cong thì kéo điểm giữa cạnh để uốn.' },
        { title: 'Cắt', body: 'Xén bỏ tựa trang và hàng tiêu đề thì vị trí dòng khớp chính xác hơn hẳn.' },
        { title: 'Xoay', body: 'Chụp ngang thì xoay 90°. Nghiêng nhẹ thì chỉnh từng độ một.' },
        { title: 'Sáng và tương phản', body: 'Ảnh in nhạt hoặc có bóng thì chỉnh cho rõ rồi hãy quét.' },
      ],
    },
    limits: {
      title: 'Nói trước về độ chính xác',
      lead:
        'Tôi không hứa 100%. Đây là số đo thật. Biết trước thì đây là công cụ dùng được; giấu đi rồi bị phát hiện thì thành lỗi.',
      rows: [
        { metric: 'Số tiền và số dư', value: '93–100%', note: 'Phần này có chuỗi số dư bảo chứng' },
        { metric: 'Tên đối tác katakana', value: '60–95%', note: 'Chuỗi số dư không đỡ được, phải soát mắt' },
        { metric: 'Thời gian mỗi trang', value: 'Vài giây', note: 'Nhiều mặt sổ thì xếp hàng chạy lần lượt' },
      ],
      notDoTitle: 'Những việc nó KHÔNG làm',
      notDo: [
        'Không tự định khoản kế toán. Nó chép đúng cột 区分 in trên sổ.',
        'Không làm báo cáo theo tháng. Chỉ có tổng thu, tổng chi và số dư cuối.',
        'Không nối thẳng vào phần mềm kế toán. Xuất Excel / CSV rồi nhập vào.',
      ],
      value:
        'Giá trị của công cụ này không nằm ở chỗ đọc đúng tất cả, mà ở chỗ chỉ đúng nơi cần soát.',
    },
    excel: {
      title: 'File nhận về trông như thế này',
      lead:
        'Đúng như khi mở bằng Excel. Kết quả kiểm chứng và các ô vàng đều nằm sẵn trong file, không phải chỉ có trên web.',
      formulaBar: 'Đã kiểm toàn bộ chuỗi số dư',
      bankLabel: 'Ngân hàng',
      bankValue: 'Japan Post Bank',
      verifyLabel: 'Kiểm chứng',
      verifyValue: 'Đã kiểm toàn bộ chuỗi (mọi dòng khớp)',
      colDate: 'Ngày',
      colDesc: 'Nội dung',
      colOut: 'Tiền ra',
      colIn: 'Tiền vào',
      colBal: 'Số dư',
      sheetName: 'Sổ 1',
      sheetName2: 'Sổ 2',
      points: [
        {
          t: 'Kết quả kiểm chứng nằm trong file',
          d: 'Dòng 2 ghi mức kiểm chứng. Nửa năm sau mở lại vẫn biết bảng này đã được kiểm hay chưa.',
        },
        {
          t: 'Ô vàng giữ nguyên',
          d: 'Ô nào máy không chắc thì xuất ra vẫn vàng. Mở bằng Excel chỉ cần soát đúng mấy ô đó.',
        },
        {
          t: 'Dòng ghi chú để trống ô tiền',
          d: 'Dòng「chuyển sang sổ mới」không có số tiền, nên bấm SUM tính tổng vẫn ra đúng.',
        },
      ],
    },
    app: {
      title: 'Màn hình làm việc thật',
      lead:
        'Đây không phải hình vẽ mô phỏng — là ảnh chụp thẳng từ ứng dụng đang chạy. Trái là danh sách mặt sổ, giữa là ảnh, phải là kết quả đọc. Bấm một dòng trong bảng thì ảnh hiện vệt đỏ ở đúng dòng đó, vừa nhìn vừa sửa ngay tại chỗ.',
      shotAlt: 'Màn hình làm việc của 通帳スキャン: cột trái là các mặt sổ đã quét, giữa là ảnh cuốn sổ, phải là bảng kết quả.',
      marks: [
        { x: 34, y: 39, text: 'Vệt đỏ ở đúng dòng' },
        { x: 89, y: 33.5, text: 'Mọi dòng kiểm OK' },
        { x: 96, y: 89, text: 'Tổng và số dư cuối' },
      ],
      caption: 'Chạy thẳng trên trình duyệt, không phải cài gì. Ảnh dùng sổ mẫu, tên công ty đã được thay.',
    },
    pricing: {
      title: 'Bắt đầu nhỏ rồi lớn dần',
      lead:
        'Gói nào cũng có đủ mọi tính năng. Khác nhau chỉ ở số mặt sổ đọc được mỗi tháng và thời gian giữ file. Tháng ít việc thì trả ít, tới kỳ quyết toán mới tăng lên.',
      badge: 'Đang chuẩn bị · giá dự kiến',
      note: 'Giá chưa chốt. Những con số ở đây là phương án đang cân nhắc, khi mở bán thật có thể khác.',
      rowWho: 'Hợp với ai',
      rowPrice: 'Mỗi tháng',
      rowPages: 'Số mặt sổ',
      rowPer: 'Mỗi mặt',
      rowKeep: 'Giữ file',
      rowFeat: 'Tính năng',
      featAll: 'Đầy đủ',
      best: 'Thường là gói này',
      plans: [
        { name: 'Dùng thử', price: '¥0', pages: '20 mặt/tháng', per: '—', keep: '7 ngày', who: 'Muốn xem nó chạy thế nào trước đã' },
        { name: 'Làm việc', price: '¥2.000', pages: '300 mặt/tháng', per: '≈ ¥6,7', keep: '90 ngày', who: 'Hộ kinh doanh ghi sổ hằng tháng' },
        { name: 'Văn phòng', price: '¥6.000', pages: '1.500 mặt/tháng', per: '≈ ¥4,0', keep: '1 năm', who: 'Văn phòng kế toán làm sổ cho nhiều khách' },
      ],
      featTitle: 'Gói nào cũng có',
      feats: [
        'Xuất ra Excel / CSV',
        'Kiểm chuỗi số dư toàn bộ các dòng',
        'Nắn phối cảnh · cắt · xoay · chỉnh sáng',
        'Tự tách PDF nhiều trang thành từng mặt',
        'Tách theo mặt sổ hoặc gộp một bảng',
      ],
      ask: 'Nếu số mặt sổ không đủ dùng, hoặc anh chị cần khối lượng lớn hơn, cứ trao đổi với chúng tôi.',
    },
    explains: {
      chain: {
        label: 'Ví dụ chuỗi số dư',
        body: 'Lấy số dư dòng trên, trừ tiền ra, cộng tiền vào thì ra số dư dòng này. Chỉ cần đọc sai một dòng là phép tính lệch, nên khớp hết nghĩa là con số tin được.',
      },
      kana: {
        label: 'Katakana chữ to là gì',
        body: 'Sổ in bằng katakana chữ to kiểu cũ. Sửa thành chính tả hiện đại là không đối chiếu được với chứng từ chuyển khoản nữa.',
      },
      rowno: {
        label: 'Số thứ tự dòng nằm đâu',
        body: 'Phần lớn sổ in mờ số 01–24 ở lề trái. Đọc được số đó thì biết máy có bỏ sót dòng nào không.',
      },
      katakana: {
        label: 'Vì sao katakana khó hơn',
        body: 'Chuỗi số dư không bảo chứng được tên. Số tiền thì có phép tính với dòng trên dòng dưới để kiểm, còn đọc sai tên công ty thì phép tính vẫn đúng nên máy không biết. Ô đó cũng không bôi vàng, phải soát bằng mắt.',
      },
      level: {
        label: 'Ba mức kiểm chứng',
        body: 'Dòng 2 của file sẽ ghi một trong ba mức này.',
      },
    },
    faq: {
      title: 'Câu hỏi thường gặp',
      items: [
        {
          q: 'Hỗ trợ sổ của ngân hàng nào?',
          a: 'Đã đối chiếu trên sổ thật của ゆうちょ, Fukuoka, Tokushima Taisho, Nishi-Nippon City. Vì máy đọc theo tiêu đề cột chứ không theo mẫu cứng nên ngân hàng chưa có trong danh sách thường vẫn đọc được. Anh chị thử sổ mẫu hoặc một trang là biết ngay.',
        },
        {
          q: 'Nhận định dạng file nào?',
          a: 'Ảnh PNG, JPG, WEBP và file PDF. PDF nhiều trang tự tách thành từng mặt sổ để chỉnh và quét riêng.',
        },
        {
          q: 'Chữ viết tay có đọc được không?',
          a: 'Ghi chú viết tay kiểu「chuyển sang sổ mới」được giữ lại dưới dạng dòng ghi chú. Còn số tiền viết tay thì độ chính xác thấp hơn chữ in, nên hãy xem kỹ những ô vàng.',
        },
        {
          q: 'Ảnh sổ của tôi đi đâu?',
          a: 'Ảnh được lưu trên máy chủ và gửi tới AI để đọc. Dữ liệu tách riêng theo từng tài khoản, người dùng khác không thấy được. Bản trả phí thì nội dung gửi đi không bị dùng để huấn luyện.',
        },
        {
          q: 'Có dùng thử miễn phí được không?',
          a: 'Có. Sổ mẫu chạy hết luồng mà không gọi AI nên không tốn gì. Sổ thật trong hạn mức miễn phí cũng không mất phí.',
        },
        {
          q: 'Quét lại cùng một trang có mất tiền lần nữa không?',
          a: 'Không, nếu ảnh chưa bị sửa gì — kết quả cũ được dùng lại. Xoay hay cắt là ảnh đổi thật nên phải đọc lại.',
        },
      ],
    },
    cta: {
      title: 'Thử đúng một mặt sổ đang có trên bàn',
      lead: 'Sổ mẫu không tốn phí. Xem nó chạy thế nào rồi hãy quyết có đưa sổ thật lên hay không.',
      button: 'Bắt đầu quét',
    },
    footer: {
      tagline: 'Sổ ngân hàng Nhật, thành bảng đã kiểm chứng.',
      product: 'Mở ứng dụng',
      langLabel: 'Ngôn ngữ',
      rights: 'Tsucho-scan',
    },
  },

  en: {
    nav: {
      reads: 'What it reads',
      verify: 'Checking',
      how: 'How it goes',
      screen: 'The screen',
      output: 'The file',
      limits: 'Accuracy',
      pricing: 'Pricing',
      faq: 'Questions',
      login: 'Sign in',
      start: 'Try it',
      menu: 'Menu',
    },
    hero: {
      title: 'Japanese passbooks,\nas a checked spreadsheet.',
      lead:
        'Reads photos or PDFs of bank passbooks and writes Excel or CSV. Every row is checked against the balance chain, and the cells the machine was unsure about are marked yellow. Those few are the only ones you review.',
      primary: 'Scan a passbook page',
      secondary: 'See what it reads',
      note: 'A sample passbook is built in, so you can watch it work before uploading a real one.',
      demoPrinted: 'Printed in the passbook',
      demoRead: 'What was read',
      demoChain: 'Balance chain',
      demoSeal: 'Checked',
      demoHint: 'Pick a row in the table and a red band marks that row on the photo. The last row is handwritten — it is read correctly and filed as a note, not a transaction.',
      tagNote: 'note',
      col: {
        no: 'Row',
        date: 'Date',
        desc: 'Description',
        out: 'Paid out',
        in: 'Paid in',
        bal: 'Balance',
      },
    },
    reads: {
      title: 'Every passbook is laid out differently. That is the hard part.',
      lead:
        'They are all called passbooks, but each bank orders the columns differently and uses its own symbols. These are the cases that broke on real passbooks and were fixed.',
      items: [
        {
          title: 'Books with reversed columns',
          body:
            'A Japan Post passbook puts paid-in to the left of paid-out — the opposite of most books. Column headings are read first, so money in and out never swap places on a guess.',
          sample: 'Date｜Branch｜Paid in｜Paid out｜Balance',
        },
        {
          title: 'The symbol key at the foot of the page',
          body:
            'Many books print a key such as "K,M…paid in / L…transfer in / Q…paid out / R…transfer out". The key printed on that book is followed, rather than a general rule.',
          sample: 'K,M…in　L…transfer in　Q…out',
        },
        {
          title: 'Large kana kept as printed',
          body:
            'Passbooks print large kana: シヤ, フイ. Correcting them to modern small kana breaks matching against the payment records, so they are copied exactly as printed.',
          sample: 'シンセイフイナンシヤル',
        },
        {
          title: 'Single-digit era years',
          body:
            '"7-04-30" is 30 April, Reiwa 7. Dropping that leading digit moves the whole date. Books that print years either way are read correctly.',
          sample: '7-04-30 → Reiwa 7',
        },
        {
          title: 'Row numbers catch skipped rows',
          body:
            'Most books print a faint 01–24 down the left margin. Reading those numbers is how a skipped row gets noticed.',
          sample: '01 02 03 … 24',
        },
        {
          title: 'Rows that are not transactions',
          body:
            '"Carried forward" and "not yet entered" are not transactions. They are kept as notes with the amount columns left empty, so the totals stay right.',
          sample: 'Carried to new book',
        },
        {
          title: 'Several passbooks in one photo',
          body:
            'A photo holding both a cover and a transaction page is split per account, and the bank name from the book lying next to it is not borrowed.',
          sample: 'Account A ／ Account B',
        },
        {
          title: 'Pages across the fold',
          body:
            'An open book has a fold or a gap down the middle. If the columns and the balance continue, it is treated as one account.',
          sample: 'Top → fold → bottom',
        },
      ],
    },
    verify: {
      title: 'Whether the numbers are right is something the passbook already knows.',
      lead:
        'Each row holds a fixed relationship to the row above it. Checking that relationship across every row is the balance chain — the machine proves its own reading, so nobody reaches for a calculator.',
      formula: 'Previous balance − paid out + paid in = this row’s balance',
      workedLabel: 'Three consecutive rows from the sample book',
      tick: 'agrees',
      levelsTitle: 'The exported spreadsheet carries the result of that check',
      levels: [
        { label: 'Whole chain checked', note: 'Every row adds up. The numbers are ready to use.' },
        { label: 'Partly checked', note: 'Points at exactly the rows that do not add up, and how many.' },
        { label: 'Not checked', note: 'The balance column could not be read, so nothing could be verified.' },
      ],
      yellowTitle: 'Yellow means the machine was not sure',
      yellowExplainLabel: 'What a yellow cell looks like',
      yellowExplain: 'A row where the balance chain does not agree turns yellow like this. Compare with the photo and type the correction; balances below recalculate.',
      yellowBody:
        'Cells that do not add up turn yellow. Compare against the photo and type the correction; balances recalculate from that row down.',
      caveatTitle: 'What the balance chain cannot do',
      caveatBody:
        'It only proves the numbers agree with each other. A row missed entirely, or a misread katakana name, will pass straight through. Those still need your eyes.',
    },
    how: {
      title: 'How it goes',
      lead: 'Nothing to configure. Bring the pages in, fix what is marked, write the file.',
      steps: [
        { title: 'Bring the passbook in', body: 'Photos or PDF. A multi-page PDF splits into one page per sheet.' },
        {
          title: 'Straighten the photo',
          body: 'Shot at an angle? Drag the four corners onto the page. A straighter photo reads more accurately.',
        },
        { title: 'Read it', body: 'Only the pages you picked. Seconds per page.' },
        {
          title: 'Review the yellow',
          body: 'Pick a row and a red band marks it on the photo. Compare, correct, move between cells with the arrow keys.',
        },
        { title: 'Write Excel or CSV', body: 'One sheet per passbook page, or everything merged into one table.' },
      ],
    },
    tools: {
      title: 'The straighter the photo, the more accurate the reading',
      lead: 'So the image tools sit right before the reading step.',
      items: [
        { title: 'Perspective', body: 'Drag the four corners onto the page. A book that will not lie flat bends by dragging the edge midpoints.' },
        { title: 'Crop', body: 'Cutting away the title and column headings makes row positions line up far better.' },
        { title: 'Rotate', body: 'Turn a sideways photo in 90° steps, and nudge a slight tilt a degree at a time.' },
        { title: 'Brightness and contrast', body: 'Lift faint printing or shadow before reading.' },
      ],
    },
    limits: {
      title: 'Accuracy, stated up front',
      lead:
        'No promise of 100%. These are measured figures. Known in advance they make this a usable tool; discovered later they would be a defect.',
      rows: [
        { metric: 'Amounts and balances', value: '93–100%', note: 'The part the balance chain backs up' },
        { metric: 'Katakana payee names', value: '60–95%', note: 'The chain cannot protect this. Eyes required' },
        { metric: 'Time per page', value: 'A few seconds', note: 'Pages queue and run one after another' },
      ],
      notDoTitle: 'What it does not do',
      notDo: [
        'No automatic bookkeeping classification. It copies the category printed in the book.',
        'No monthly reports. Totals in and out, and the closing balance.',
        'No direct link into accounting software. Export Excel or CSV and import that.',
      ],
      value:
        'The worth of this tool is not reading everything correctly. It is pointing accurately at the places worth checking.',
    },
    excel: {
      title: 'This is the file you get back',
      lead:
        'Exactly as it opens in Excel. The result of the check and the yellow marks travel inside the file, not just on the web page.',
      formulaBar: 'Whole balance chain checked',
      bankLabel: 'Bank',
      bankValue: 'Japan Post Bank',
      verifyLabel: 'Checked',
      verifyValue: 'Whole chain checked (every row agrees)',
      colDate: 'Date',
      colDesc: 'Description',
      colOut: 'Paid out',
      colIn: 'Paid in',
      colBal: 'Balance',
      sheetName: 'Book 1',
      sheetName2: 'Book 2',
      points: [
        {
          t: 'The check result stays in the file',
          d: 'Row 2 records the verification level. Open it six months later and you still know whether it was checked.',
        },
        {
          t: 'The yellow marks survive',
          d: 'Cells the machine was unsure about are written out yellow. Open it in Excel and only those need a look.',
        },
        {
          t: 'Note rows leave the amounts empty',
          d: 'Rows like "carried forward" carry no amount, so a SUM across the column still comes out right.',
        },
      ],
    },
    app: {
      title: 'The actual workspace',
      lead:
        'Not a mockup — a screenshot of the running app. Passbook pages on the left, the photo in the middle, the reading on the right. Pick a row and a red band marks it on the photo, so you compare and correct in place.',
      shotAlt: 'The 通帳スキャン workspace: scanned passbook pages on the left, the passbook photo in the middle, the results table on the right.',
      marks: [
        { x: 34, y: 39, text: 'Red band on that row' },
        { x: 89, y: 33.5, text: 'Every row checks out' },
        { x: 96, y: 89, text: 'Totals and final balance' },
      ],
      caption: 'Runs in the browser. Nothing to install. The screen shows a sample book; the company name has been replaced.',
    },
    pricing: {
      title: 'Start small, grow later',
      lead:
        'Every plan has every feature. What changes is how many passbook pages you can read each month, and how long the files are kept. Quiet months cost less; scale up only at year end.',
      badge: 'In preparation · indicative',
      note: 'Pricing is not settled. These figures are under consideration and may change before launch.',
      rowWho: 'Who it suits',
      rowPrice: 'Per month',
      rowPages: 'Pages read',
      rowPer: 'Per page',
      rowKeep: 'Files kept',
      rowFeat: 'Features',
      featAll: 'All of them',
      best: 'Usually this one',
      plans: [
        { name: 'Trial', price: '¥0', pages: '20 pages/mo', per: '—', keep: '7 days', who: 'Anyone who wants to watch it work first' },
        { name: 'Working', price: '¥2,000', pages: '300 pages/mo', per: '≈ ¥6.7', keep: '90 days', who: 'A business doing its own books each month' },
        { name: 'Practice', price: '¥6,000', pages: '1,500 pages/mo', per: '≈ ¥4.0', keep: '1 year', who: 'An accounting office handling many clients' },
      ],
      featTitle: 'In every plan',
      feats: [
        'Excel and CSV export',
        'Balance-chain check on every row',
        'Keystone, crop, rotate, brightness',
        'Multi-page PDFs split automatically',
        'One sheet per page, or all in one table',
      ],
      ask: 'If the page count does not fit, or you need a much larger volume, get in touch.',
    },
    explains: {
      chain: {
        label: 'The balance chain, worked',
        body: 'Take the previous balance, subtract what went out, add what came in, and you get this row. One misread digit breaks it — so when every row agrees, the numbers can be trusted.',
      },
      kana: {
        label: 'What large kana means',
        body: 'Passbooks print old-style large kana. Correcting them to modern spelling breaks matching against the transfer records.',
      },
      rowno: {
        label: 'Where the row numbers are',
        body: 'Most books print a faint 01–24 down the left margin. Reading those numbers is how a skipped row gets noticed.',
      },
      katakana: {
        label: 'Why katakana is harder',
        body: 'The balance chain cannot back up a name. An amount is checked by the arithmetic around it; a misread company name leaves the arithmetic intact, so the machine never notices. Those cells are not marked yellow either — they need your eyes.',
      },
      level: {
        label: 'The three levels',
        body: 'Row 2 of the file carries one of these three.',
      },
    },
    faq: {
      title: 'Questions',
      items: [
        {
          q: 'Which banks are supported?',
          a: 'Built and checked against real books from Japan Post, Fukuoka, Tokushima Taisho and Nishi-Nippon City. Because columns are read from their headings rather than a fixed template, banks not on that list usually read fine too. Try the sample, or one page.',
        },
        {
          q: 'Which file formats?',
          a: 'PNG, JPG and WEBP images, plus PDF. A multi-page PDF splits into separate pages you can adjust and read individually.',
        },
        {
          q: 'Does it read handwriting?',
          a: 'Handwritten notes such as "carried to a new book" are kept as note rows. Handwritten amounts read less accurately than print, so check anything marked yellow.',
        },
        {
          q: 'Where do my passbook images go?',
          a: 'Images are stored on the server and sent to the AI to be read. Data is separated per account and other users cannot see it. On the paid tier what is sent is not used for training.',
        },
        {
          q: 'Can I try it free?',
          a: 'Yes. The sample passbook runs the whole flow without calling the AI, so it costs nothing. Real pages are also free inside the free allowance.',
        },
        {
          q: 'Does re-reading the same page cost again?',
          a: 'Not if the image is untouched — the earlier result is reused. Rotating or cropping genuinely changes the image, so it is read again.',
        },
      ],
    },
    cta: {
      title: 'Try one page from the passbook on your desk',
      lead: 'The sample costs nothing. Watch it work, then decide whether to upload a real book.',
      button: 'Start scanning',
    },
    footer: {
      tagline: 'Japanese passbooks, as a checked spreadsheet.',
      product: 'Open the app',
      langLabel: 'Language',
      rights: 'Tsucho-scan',
    },
  },
} as const

export type Dict = (typeof DICT)['jp']

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({
  lang: 'jp',
  t: DICT.jp,
  setLang: () => {},
})

const KEY = 'tsucho-site-lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('jp')

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(KEY)
    } catch {
      /* trình duyệt chặn localStorage — cứ dùng mặc định */
    }
    if (saved && LANGS.some((l) => l.code === saved)) {
      setLangState(saved as Lang)
      document.documentElement.lang = HTML_LANG[saved as Lang]
    }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    document.documentElement.lang = HTML_LANG[l]
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* không ghi nhớ được thì thôi, không phải lỗi đáng báo */
    }
  }, [])

  return (
    <Ctx.Provider value={{ lang, t: DICT[lang] as Dict, setLang }}>{children}</Ctx.Provider>
  )
}

export function useI18n() {
  return useContext(Ctx)
}
