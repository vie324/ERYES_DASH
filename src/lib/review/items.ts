// 追加開発（依頼10〜23）を1つずつ触って確かめるための一覧（/staff/review）。
// 確認が終わったら、このファイルと /staff/review は消してよい（ENiの業務の文言ではないので、管理画面からの編集はしない）。
//
// デモ（DEMO_MODE=1 か Supabase 未設定）のアカウント（パスワードはすべて staff1234、管理者だけ admin1234）：
//  admin＝相川 恵（管理者・代表の役）／daiki＝山本 大輝（ENi スタイリスト・幹部）／yuina＝中島 結菜（ENi スタイリスト）
//  aoi＝小林 蒼（ENi アシスタント）／hikari＝藤田 ひかり（ENi アシスタント）／misaki＝佐藤 美咲（イーリス）／manager＝森 さくら（イーリスの店舗の管理者）

export interface ReviewStep {
  text: string;
  href?: string;
}

export interface ReviewItem {
  no: string;
  eni: string;
  title: string;
  summary: string;
  /** 試すアカウント */
  accounts: string;
  steps: ReviewStep[];
  /** 確かめるところ（完了の条件から） */
  checks: string[];
  /** ENiの確認が要ること・まだのこと */
  todo?: string[];
}

export const DEMO_ACCOUNTS: { id: string; who: string }[] = [
  { id: "admin / admin1234", who: "相川 恵（管理者・代表の役。AIしもんの相談の閲覧・Claudeからの読み取りも試せる）" },
  { id: "daiki / staff1234", who: "山本 大輝（ENi スタイリスト・幹部）" },
  { id: "yuina / staff1234", who: "中島 結菜（ENi スタイリスト）" },
  { id: "aoi / staff1234", who: "小林 蒼（ENi アシスタント）" },
  { id: "hikari / staff1234", who: "藤田 ひかり（ENi アシスタント）" },
  { id: "misaki / staff1234", who: "佐藤 美咲（イーリスのスタッフ）" },
  { id: "manager / staff1234", who: "森 さくら（イーリスの店舗の管理者）" },
];

export const REVIEW_ITEMS: ReviewItem[] = [
  {
    no: "10",
    eni: "53・67・69",
    title: "社内SNS・サンクス・月間表彰",
    summary: "いい事例のタイムライン（写真・カテゴリ・いいね・コメント・固定・絞り込み）、サンクス（今のサンクスカードと同じデータ）、見ないと消えない通知、月間サンクス表彰。",
    accounts: "aoi（投稿・サンクス）→ daiki（固定・コメント）→ admin（表彰の発表）",
    steps: [
      { text: "タイムラインを開き、店舗・カテゴリで絞り込む", href: "/staff/sns" },
      { text: "いい事例を写真つきで投稿（個人情報の注意書きが出る）", href: "/staff/sns/new" },
      { text: "サンクスを送る（相手・ひとこと・スタンプ・非公開・ポイント）", href: "/staff/sns/thanks/new" },
      { text: "受け取った人のホーム・ベルに、開くまで残る", href: "/staff/inbox" },
      { text: "幹部で投稿を固定する。管理者で表彰の候補から選んで発表", href: "/staff/sns/awards" },
      { text: "カテゴリ・スタンプ・ポイント・注意書きの設定", href: "/admin/sns" },
    ],
    checks: ["写真が iPhone で上げられる", "非公開のサンクスは本人どうしだけに見える", "順位は自動では出ず、管理者が選んで発表する", "ホームの「ありがとう」と同じ数になる"],
    todo: ["昔のサンクスカードのデータの場所（CSVでの取り込みは /admin/sns に用意）"],
  },
  {
    no: "11",
    eni: "68・43・45",
    title: "AIしもんの見守り・教育／ENi Wikipedia",
    summary: "代表だけが全員の相談を人ごと・日付ごとに見られる。教育（項目ごとの登録・停止・並べ替え・履歴・戻す）。ENi Wikipedia（公開範囲・履歴・Notionの取り込み・Wikiだけを根拠にしたAI検索）。",
    accounts: "aoi（相談・Wiki）→ admin（相談の閲覧・教育・Wikiの編集）",
    steps: [
      { text: "AIしもんの画面に「相談内容は代表が見ることがあります」が出ている", href: "/staff/ai-shimon" },
      { text: "代表で、相談を人ごと・日付ごとに見る（ほかの管理者には見えない）", href: "/staff/ai-shimon/logs" },
      { text: "教育の項目を足す・止める・並べ替える・前の版に戻す", href: "/staff/ai-shimon/training" },
      { text: "Wikiのページを作る（カテゴリ・公開範囲）・履歴から戻す", href: "/staff/wiki" },
      { text: "NotionのMarkdown＋CSVの書き出し（zip）を取り込む", href: "/staff/wiki/import" },
      { text: "WikiのAI検索：Wikiに無いことは「見つかりません」と答える" },
    ],
    checks: ["相談の閲覧はURLを直接開いても代表以外は見られない", "権限の無いページはAI検索の根拠に使わない", "AIの答えに「AIの提案」の印とページへのリンクがある"],
    todo: ["AIしもんが今どこで動いているか（このアプリの中だけか）", "NotionのMarkdown＋CSVの書き出しファイル"],
  },
  {
    no: "12",
    eni: "20・76",
    title: "シフトと出退勤",
    summary: "希望休の締切（3か月前の5日）・締切後は店長の承認・勤務パターン・必要人数と不足の色・公開と変更の通知と履歴・出退勤とシフトのひもづけ・打刻の修正の承認・月の勤務時間CSV・はじめての案内。",
    accounts: "aoi（希望休・打刻の修正の申請）→ daiki（承認）→ admin（勤務パターン・必要人数・CSV）",
    steps: [
      { text: "はじめて開くと案内（3〜4枚）が出る。使い方はいつでも見られる", href: "/staff/guide/shift" },
      { text: "締切後の希望休を申請する", href: "/staff/schedule/late" },
      { text: "幹部で承認する（承認のお願いの一覧）", href: "/staff/approvals" },
      { text: "勤務パターン・必要人数（足りない日が赤）", href: "/admin/schedule/templates" },
      { text: "シフトの変更の履歴", href: "/admin/schedule/history" },
      { text: "打刻と、遅刻・早退・シフト外の印・打刻の修正の申請", href: "/staff/attendance" },
      { text: "月の勤務時間のCSV", href: "/admin/attendance" },
    ],
    checks: ["早番・遅番の申請は無い", "営業時間 9:30〜18:30 が初期の勤務パターン", "打刻の修正は承認制で、元の時刻と理由が残る"],
  },
  {
    no: "13",
    eni: "84",
    title: "レジ締め・現金出納帳",
    summary: "金種の計算・差額（理由は必須）・締めた人と確認者・現金の出し入れ（領収書の写真）・月の出納帳（Excel/CSV）・確認済みは管理者が理由を書かないと直せない。",
    accounts: "daiki（入力：店長・副店長）→ admin（確認・修正）。aoi では開けないこと",
    steps: [
      { text: "その日のレジ締め（金種を入れると合計と差額が出る）", href: "/staff/cash" },
      { text: "現金の出し入れを領収書の写真つきで入れる", href: "/staff/cash" },
      { text: "管理者で月の出納帳を見る・CSVに出す・確認済みを理由つきで直す", href: "/admin/cash" },
      { text: "アシスタント（aoi）で /staff/cash を直接開いても見られない", href: "/staff/cash" },
    ],
    checks: ["差額があると理由を書かないと保存できない", "項目名・摘要の種類は管理画面で変えられる"],
    todo: ["レジ締めのExcel（docs に置いてもらう）", "SalonOne のAPIの仕様（取り込みの作りだけ用意）"],
  },
  {
    no: "14",
    eni: "38・39・95",
    title: "必須入力・インセンティブ・予定の確認",
    summary: "ロールごとの必須入力をホームの一番上に出し続ける・閉店後に通知。インセンティブは締め日までのデータだけ（3日前から通知・締め日後は理由＋管理者の承認で救済）。予定は確認するまで先に進めない。",
    accounts: "aoi（ホームの帯・救済の申請・予定の確認）→ admin（設定・承認）",
    steps: [
      { text: "ホームの一番上に「まだの入力」が出る。入力すると消える", href: "/staff" },
      { text: "自分のまだの入力の一覧", href: "/staff/required" },
      { text: "インセンティブの締め日と、締め日後の救済の申請", href: "/staff/incentive" },
      { text: "新しい会社の予定・自分のシフトがあると、確認するまで他の画面に進めない", href: "/staff/confirmations" },
      { text: "管理者：ロールごとの必須入力・通知の時刻・確認が要る予定", href: "/admin/required-inputs" },
      { text: "管理者：救済の承認・CSV", href: "/admin/incentive" },
    ],
    checks: ["基本給には関係しない（インセンティブの数字だけ）", "誰がいつ確認したかを幹部が見られる"],
  },
  {
    no: "15",
    eni: "77・72",
    title: "発注先・発注と入荷・ウィッグと社販の購入記録",
    summary: "発注先の一覧・商品ごとの発注先・1タップで発注のページ・発注と入荷の記録。ウィッグ・社販の購入（社販価格は自動・月ごと人別の合計CSV）。",
    accounts: "daiki（発注・入荷）→ aoi（自分の購入履歴）→ admin（全員分・CSV）",
    steps: [
      { text: "発注先・商品（発注先・社販価格）を登録", href: "/admin/suppliers" },
      { text: "発注する（発注のページが開く）・入荷を記録する", href: "/staff/orders/place" },
      { text: "ウィッグ・社販を記録（自分の履歴だけ見える）", href: "/staff/purchases" },
      { text: "管理者：月ごと・人ごとの合計とCSV", href: "/admin/purchases" },
    ],
    checks: ["原価・仕入率は管理者だけに見える", "全員分の購入記録は管理者だけ"],
    todo: ["社販の給与天引きの労使協定"],
  },
  {
    no: "16",
    eni: "74",
    title: "業務の整理の表の取り込み",
    summary: "業務の整理の表（CSV）を取り込み、ルーティン業務などに当てはめて初期データにする。判断できない行は残して知らせる。",
    accounts: "admin",
    steps: [{ text: "見本の形でCSVを用意して取り込む（確かめてから当てはめ）", href: "/admin/work-import" }],
    checks: ["当てはめ先が分からない行は「判断できないもの」として残る"],
    todo: ["業務の整理の表（まだ届いていない）"],
  },
  {
    no: "17",
    eni: "75",
    title: "稼働率",
    summary: "ENi＝入客時間÷（段数×8時間）、イーリス＝施術時間÷（シフト−休憩）。早く終わった・オーバーした時間。日報・SalonOneの取り込みから毎日計算し、手直しもできる。",
    accounts: "daiki（自分と担当メンバー）→ aoi（自分）",
    steps: [
      { text: "自分の月の稼働率と日ごとの数字", href: "/staff/utilization" },
      { text: "幹部：担当メンバーの一覧・日ごとの手直し", href: "/staff/utilization" },
      { text: "管理者：定時実行の「稼働率の計算」を今すぐ実行", href: "/admin/features#jobs" },
    ],
    checks: ["サロンボードにはつながない", "日ごとに保存され、月の数字は合計の割合"],
    todo: ["SalonOne のAPIの仕様"],
  },
  {
    no: "18",
    eni: "71",
    title: "在庫・棚卸し・発注の自動化",
    summary: "入荷・販売・社販・使用（開封は1タップ）・廃棄の記録。棚卸しで照らし合わせ（差が2個以上か10%以上を目立たせる・確定後は変えられない）。決めた数を下回ったら発注のリストと通知。",
    accounts: "daiki",
    steps: [
      { text: "在庫の一覧・開封を1タップで記録・バーコードで探す", href: "/staff/inventory" },
      { text: "棚卸し（差が大きいものが目立つ・理由のメモ・確定）", href: "/staff/inventory/stocktake" },
      { text: "管理者：定時実行の「発注が必要な商品の通知」を今すぐ実行", href: "/admin/features#jobs" },
    ],
    checks: ["メール・FAXでの発注は提案だけ（送らない）"],
  },
  {
    no: "19",
    eni: "92",
    title: "目標（会社→店舗→個人）・AIの今週やること・幹部のフィードバック",
    summary: "ピラミッドを土台に目標をつなぎ、アクションプラン（タスク・ルーティン）の進み具合を反映。AIが今週・今月やることを3つ提案（採用・修正・却下。採用でタスク）。幹部が振り返りに返す。",
    accounts: "aoi（目標・提案・振り返り）→ daiki（フィードバック）→ admin（会社・店舗の目標）",
    steps: [
      { text: "自分の目標・アクションプラン・今週やること（AIの提案の印）", href: "/staff/goals" },
      { text: "幹部：担当メンバーの目標と振り返りに返す", href: "/staff/goals/team" },
      { text: "管理者：会社・店舗の目標", href: "/admin/goals" },
    ],
    checks: ["提案は1人1週1回だけ作って保存", "AIが使えないときは決まった作り方の一覧になる"],
    todo: ["会社の目標（5年10億）の正式な言葉"],
  },
  {
    no: "20",
    eni: "74・75",
    title: "カリキュラム・成長ロードマップ／動画の持ち出し防止",
    summary: "入社からの1本の時間軸に、段階・求めること・合格した項目・練習時間。遅れていれば赤。動画はアプリの中だけ（期限つきの再生URL・ダウンロードなし・名前の透かし・どこまで見たか）。",
    accounts: "aoi（遅れがある人）→ daiki（合格の判定）→ admin（中身の編集）",
    steps: [
      { text: "自分のロードマップ（入社からの位置・次の目標・遅れ）", href: "/staff/growth" },
      { text: "動画を見る（長押しで保存できない・名前が重なる・途中から続き）", href: "/staff/growth/videos" },
      { text: "幹部：メンバーの一覧から合格・もう一度を入れる（本人に通知）", href: "/staff/growth/team" },
      { text: "管理者：段階・項目・動画・入社日", href: "/admin/growth" },
    ],
    checks: ["再生のURLはログインしていないと取れない", "iPhone でも全画面に切り替わらず、名前が消えない"],
    todo: ["カリキュラム・コンピテンシーの資料と動画の置き場所", "Cloudflare Stream の契約と環境変数（推奨）"],
  },
  {
    no: "21",
    eni: "83",
    title: "中さんのClaudeから読む（MCP）",
    summary: "中さんのClaude（カスタムコネクタ）から、スタッフ・売上の推移・練習時間・稼働率・日報週報の提出・ルーティン達成率・目標を読むだけ。お客様の個人情報は返さない。読んだ記録は管理画面。",
    accounts: "admin（代表の役）",
    steps: [
      { text: "管理画面のつなぎ方を見る（URL：/api/mcp）", href: "/admin/mcp" },
      { text: "本番かプレビューのURLで、Claude の「カスタムコネクタを追加」から接続→許可の画面で代表のアカウントで許可" },
      { text: "Claude に「今月の練習時間を人ごとに」と聞く → 読んだ記録に残る", href: "/admin/mcp" },
    ],
    checks: ["代表以外のアカウントでは許可できない", "書き込みのツールは無い"],
    todo: ["「AIしもんと同じAPIキー」の意図（MCPはClaude側から呼ぶのでAPIキーは要らない）", "コネクタの登録（中さんのClaudeのアカウントで）"],
  },
  {
    no: "22",
    eni: "—",
    title: "Instagram",
    summary: "本人がInstagramログインでつなぐ（プロアカウントだけ）。毎日フォロワー数と前の日の数字・直近の投稿の数字を集める。期限が近いと自動で更新、切れたら本人に通知。幹部は一覧と店舗の合計。",
    accounts: "daiki（自分の数字・メンバーの一覧）→ aoi（見本の数字で試す）",
    steps: [
      { text: "自分の数字（デモは見本の数字）", href: "/staff/instagram" },
      { text: "幹部：メンバーの一覧と店舗の合計", href: "/staff/instagram/team" },
      { text: "管理者：Metaのアプリに登録するURL・集める数字の名前・今すぐ集める", href: "/admin/instagram" },
    ],
    checks: ["トークンは暗号化して保存", "使えない数字の名前は、その数字だけ飛ばして管理画面に出る"],
    todo: ["Metaの開発者のアプリ（INSTAGRAM_APP_ID/SECRET）と審査の準備", "スタッフのプロアカウントへの切り替え（数字の名前は2026-11-26に公式のドキュメントで確認済み）"],
  },
  {
    no: "23",
    eni: "—",
    title: "面接（katibito）",
    summary: "応募者の一覧（名前・応募日・経路・段階）。面接の日時と面接官3人で、面接官の予定に入る。録画は同意のチェックが必須で、面接官と管理者だけ・選考が終わってから6か月で自動で消す。評価は全員がつけ終わるまで見えない。",
    accounts: "admin（登録・判定）→ yuina（面接官：評価をつける）→ aoi（見られないこと）",
    steps: [
      { text: "応募者の一覧と登録", href: "/staff/recruit" },
      { text: "「見本 花子」さん：yuina で評価をつける → 全員の評価が見えるようになる", href: "/staff/recruit" },
      { text: "面接官のスケジュールの画面に「面接：…」が出る", href: "/staff/plan" },
      { text: "録画を上げる（同意のチェックが無いと上げられない）", href: "/staff/recruit" },
      { text: "管理者：段階・経路・評価シートの項目・保存期間", href: "/admin/recruit" },
      { text: "管理者：定時実行の「面接の録画の自動削除」を今すぐ実行（見本 次郎さんの録画が消える）", href: "/admin/features#jobs" },
    ],
    checks: ["面接官でない人は応募者のURLを直接開いても見られない", "評価がそろうまで、ほかの面接官の評価は見えない"],
    todo: ["katibito の資料（連携の仕組み。いまは結果を手で登録）"],
  },
];
