# ERYES DASH — アイラッシュ・眉毛サロン業務システム

ホットペッパービューティーの予約はそのままに、サロン運営に必要な6つの機能だけに絞った業務システムです。

| 機能 | 概要 |
|---|---|
| ① LINE連携カウンセリング | 友だち追加 → 氏名登録 → LIFFフォーム入力 → スタッフがiPadで確認 |
| ② 日報・成績管理 | 1分で終わる日報入力。売上・次回予約率・新規/既存比を自動集計 |
| ③ GPS勤怠 | 店舗から100m以内のみ打刻成立。月次集計と固定残業の超過アラート |
| ④ 売上CSV出力 | 期間指定で日報ベースの売上をCSV出力（Excel対応・UTF-8 BOM付き） |
| ⑤ 前日リマインド | 毎日19時に翌日予約の顧客へLINE自動送信（二重送信防止つき） |
| ⑥ 一斉配信 | 登録済みの全顧客へテキストをPush送信。履歴・通数を記録 |

## 画面構成

| 画面 | URL | 利用者 |
|---|---|---|
| スタッフ用 | `/staff` | 日報入力／打刻／カウンセリング確認／自分の成績 |
| 管理者用 | `/admin` | 全スタッフ成績／顧客／次回予約／配信／CSV／勤怠／マスタ設定 |
| 顧客用（LIFF） | `/liff/counseling` | カウンセリング入力のみ（ログイン不要・LINE内で開く） |

認証はID＋パスワードのみ。権限は `admin`（管理者）と `staff`（スタッフ）の2種類です。
スマホ（スタッフ・顧客）とiPad（店頭確認）を優先したレスポンシブデザインです。

## 技術スタック

- Next.js 15（App Router）+ TypeScript + Tailwind CSS v4
- DB：Supabase（PostgreSQL）／ **未設定の場合はデモモード（メモリ内データ）で動作**
- LINE：Messaging API（Webhook / Push）+ LIFF ／ **未設定の場合はモック送信で動作**
- ホスティング：Vercel（定時バッチは Vercel Cron）

> **デモモードについて**：環境変数を一切設定しなくても、デモデータ（店舗・スタッフ・顧客・日報・予約）が入った状態で全機能を試せます。LINE送信はコンソールと管理画面の「モック送信ログ」に記録されます。デモモードのデータはサーバー再起動で初期化されます。

---

## 1. ローカルでの動作確認（最短手順）

```bash
npm install
npm run dev
```

http://localhost:3000 を開き、以下のデモアカウントでログインします。

| 権限 | ログインID | パスワード |
|---|---|---|
| 管理者 | `admin` | `admin1234` |
| スタッフ | `misaki` | `staff1234` |
| スタッフ | `rin` | `staff1234` |

顧客用カウンセリングフォームは http://localhost:3000/liff/counseling で開けます
（デモモードではテスト用ユーザーIDで送信され、スタッフ画面に「未確認」として表示されます）。

### LINE Webhook・リマインドのモック動作確認（curl）

```bash
# 友だち追加イベント（フルネーム送信を促す返信がログに出る）
curl -X POST http://localhost:3000/api/line/webhook -H "Content-Type: application/json" \
  -d '{"events":[{"type":"follow","replyToken":"rt-1","source":{"type":"user","userId":"test-user-1"}}]}'

# フルネーム送信 → 顧客レコードが作成される（管理者画面の顧客一覧に表示）
curl -X POST http://localhost:3000/api/line/webhook -H "Content-Type: application/json" \
  -d '{"events":[{"type":"message","replyToken":"rt-2","source":{"type":"user","userId":"test-user-1"},"message":{"type":"text","text":"山田 花子"}}]}'

# 前日リマインドバッチ（翌日の予約に送信。2回目は二重送信防止で0件になる）
curl http://localhost:3000/api/cron/reminder
```

---

## 2. 環境変数一覧

`.env.example` をコピーして `.env.local` を作成してください。**すべて未設定でもデモモードで動作します。**

| 変数 | 必須 | 説明 |
|---|---|---|
| `AUTH_SECRET` | 本番必須 | セッションCookieの署名鍵。`openssl rand -hex 32` で生成 |
| `CRON_SECRET` | 本番推奨 | 定時バッチの認証トークン。`openssl rand -hex 16` で生成（Vercelが自動でリクエストに付与） |
| `NEXT_PUBLIC_APP_URL` | 推奨 | アプリの公開URL（例 `https://xxx.vercel.app`） |
| `SUPABASE_URL` | 本番必須 | SupabaseのプロジェクトURL（未設定＝デモモード） |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番必須 | Supabaseの service_role キー（**サーバー専用・公開禁止**） |
| `LINE_CHANNEL_ID` | LINE接続時 | Messaging APIチャネルのチャネルID |
| `LINE_CHANNEL_SECRET` | LINE接続時 | チャネルシークレット（Webhook署名検証に使用） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE接続時 | チャネルアクセストークン（長期） |
| `NEXT_PUBLIC_LIFF_ID` | LINE接続時 | LIFFアプリのID（カウンセリングフォーム用） |

---

## 3. Supabase セットアップ手順

1. https://supabase.com で新規プロジェクトを作成（リージョンは Tokyo 推奨）
2. ダッシュボード → **SQL Editor** → `supabase/schema.sql` の内容を貼り付けて実行
   - 実行前にファイル末尾の初期データ（店舗名・住所・緯度経度）を実際の値に書き換えてください
   - 初期管理者は ID `admin` ／ パスワード `admin1234` で作成されます。**運用開始前に必ず管理画面で変更してください**
3. ダッシュボード → Settings → API から以下を取得し、環境変数に設定
   - Project URL → `SUPABASE_URL`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`

> セキュリティ構成：DBへのアクセスはすべてサーバー側からサービスロールキーで行います。全テーブルでRLSを有効化しポリシーを作らないため、anonキーからは一切アクセスできません。認証はスタッフマスタのID＋パスワード（scryptハッシュ）＋HMAC署名Cookieによる自前実装です。

スタッフの追加・パスワード変更は管理画面（マスタ設定）から行えます。SQLで直接登録する場合のハッシュ生成は：

```bash
npm run hash-password -- '新しいパスワード'
```

---

## 4. LINE Developers 設定手順（本番接続）

### 4-1. チャネル作成

1. https://developers.line.biz/console/ にログインし、プロバイダーを作成（例：ERYES）
2. **Messaging APIチャネル**を作成
   - LINE公式アカウントが既にある場合は、[LINE公式アカウントマネージャー](https://manager.line.biz/) → 設定 → Messaging API から連携
3. チャネル基本設定から以下を取得して環境変数へ
   - チャネルID → `LINE_CHANNEL_ID`
   - チャネルシークレット → `LINE_CHANNEL_SECRET`
4. Messaging API設定 → チャネルアクセストークン（長期）を発行 → `LINE_CHANNEL_ACCESS_TOKEN`

### 4-2. Webhook設定

1. Messaging API設定 → Webhook URL に `https://＜本番URL＞/api/line/webhook` を設定
2. 「Webhookの利用」を**オン**
3. 「検証」ボタンで疎通確認（200が返ればOK）
4. LINE公式アカウント機能の設定：
   - **応答メッセージ：オフ**（本システムが自動応答するため必須）
   - あいさつメッセージ：オフ推奨（本システムが友だち追加時に名前入力を案内するため）

### 4-3. LIFFアプリ作成（カウンセリングフォーム）

1. 同じプロバイダーに **LINEログインチャネル**を作成
2. LIFFタブ → 追加
   - サイズ：**Full**
   - エンドポイントURL：`https://＜本番URL＞/liff/counseling`
   - Scope：`profile` にチェック
3. 発行された LIFF ID（例 `1234567890-abcdefgh`）→ `NEXT_PUBLIC_LIFF_ID`

### 4-4. リッチメニュー設定

[LINE公式アカウントマネージャー](https://manager.line.biz/) → リッチメニューで作成：

- ボタン「カウンセリング」→ タイプ：リンク → URL に `https://liff.line.me/＜LIFF_ID＞` を設定

### 4-5. 接続後の確認

1. 公式LINEを友だち追加 → フルネーム送信を促すメッセージが届く
2. フルネームを送信 → 管理画面の顧客一覧に登録される
3. リッチメニューからカウンセリングを入力 → スタッフ画面に「未確認」で表示される

> **無料枠の注意**：LINEの無料プランはPush送信 月200〜500通（プランにより異なる）。リマインドと一斉配信が通数を消費します。当月の送信数は管理者ダッシュボードに表示されます。有料プラン移行はLINE公式アカウントマネージャーから行えます（システム側の変更は不要）。

---

## 5. デプロイ手順（Vercel）

1. このリポジトリをGitHubへpush
2. https://vercel.com → Add New → Project → リポジトリをインポート（Framework：Next.js が自動検出される）
3. Settings → Environment Variables に「2. 環境変数一覧」の値をすべて設定
4. Deploy
5. **定時バッチの確認**：`vercel.json` の cron 設定（`0 10 * * *` = 毎日 UTC 10:00 = **日本時間 19:00**）が
   Settings → Cron Jobs に表示されていることを確認
   - `CRON_SECRET` を設定しておくと、Vercelが自動で `Authorization: Bearer ＜CRON_SECRET＞` を付けて呼び出し、外部からの不正実行を防げます
6. デプロイ後、LINE DevelopersのWebhook URL・LIFFエンドポイントURLを本番URLに更新

> リマインド時刻を変える場合は `vercel.json` の `schedule` を変更します（UTC指定。日本時間−9時間）。

---

## 6. 運用メモ

- **日報**：同じ日に再保存すると上書きされます（修正OK）。未来日は入力不可
- **次回予約のリマインド**：前日19時のバッチ実行時点で登録済みの予約が対象です。前日19時以降に登録した翌日予約には送信されません（手動でご案内ください）
- **勤怠**：任意運用です。圏外打刻はエラー表示となり集計されません（記録は監査用に残ります）。残業は「1日8時間を超えた分」の月次累計（仮ルール）で、固定残業時間の80%で「注意」、超過で「超過」を表示します
- **CSV**：Excelでそのまま開けます（UTF-8 BOM付き）。出力項目の変更は `src/app/api/admin/csv/route.ts`
- **カウンセリング項目の変更**：`src/lib/counseling/items.ts` を編集（回答はJSONで保存されるためDB変更不要）
- **ロゴ差し替え**：`public/logo.svg` を置き換えるだけ（ファビコンは `src/app/icon.svg`）

## ディレクトリ構成（主要部分）

```
src/
├ app/
│ ├ login/               ログイン
│ ├ staff/               スタッフ画面（日報・打刻・カウンセリング確認・成績）
│ ├ admin/               管理者画面（成績・顧客・予約・配信・CSV・勤怠・設定）
│ ├ liff/counseling/     顧客用カウンセリングフォーム（LIFF）
│ └ api/
│   ├ line/webhook/      LINE Webhook（follow・message）
│   ├ liff/              LIFF用API（本人確認・回答送信）
│   ├ cron/reminder/     前日リマインドバッチ（毎日19時 JST）
│   └ admin/csv/         売上CSVダウンロード
├ lib/
│ ├ data/                データ層（mock-store / supabase-store を自動切替）
│ ├ auth/                認証（scryptパスワード・HMAC署名Cookie）
│ ├ line/                LINE APIクライアント（未設定時はモック送信）
│ ├ counseling/          カウンセリング項目定義・バリデーション
│ ├ kpi.ts               成績集計（売上・次回予約率・構成比）
│ ├ attendance.ts        勤怠集計（労働時間・残業判定）
│ └ date.ts              日本時間（JST）ユーティリティ
└ supabase/schema.sql    DBスキーマ＋初期データ
```
