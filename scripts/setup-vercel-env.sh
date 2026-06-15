#!/usr/bin/env bash
# Vercel の環境変数登録〜本番デプロイをまとめて行うヘルパー。
# 「貴社のPC」で一度だけ実行します（Vercelアカウントへのログインが必要なため）。
#
# 事前準備:
#   1) Node が入っている前提で:  npm i -g vercel
#   2) vercel login              （ブラウザでログイン）
#   3) cd <このリポジトリ> && vercel link   （対象プロジェクト eryes-dash に紐付け）
#   4) 下記テンプレを埋めた .env.production.local をリポジトリ直下に置く
#        （このファイルは .gitignore 済み＝コミットされません）
#
# 実行:
#   bash scripts/setup-vercel-env.sh
#
# .env.production.local の例（# 行とLINE系の空欄はスキップされます）:
#   AUTH_SECRET=xxxxxxxx
#   CRON_SECRET=xxxxxxxx
#   SUPABASE_URL=https://xxxx.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...
#   NEXT_PUBLIC_APP_URL=https://eryes-dash.vercel.app
#   LINE_CHANNEL_ID=
#   LINE_CHANNEL_SECRET=
#   LINE_CHANNEL_ACCESS_TOKEN=
#   NEXT_PUBLIC_LIFF_ID=

set -euo pipefail

ENV_FILE=".env.production.local"
TARGET="production"

if ! command -v vercel >/dev/null 2>&1; then
  echo "エラー: vercel CLI が見つかりません。先に  npm i -g vercel && vercel login && vercel link  を実行してください。"
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "エラー: $ENV_FILE がありません。テンプレ（このスクリプト先頭のコメント）を参考に作成してください。"
  exit 1
fi

echo "== Vercel ($TARGET) に環境変数を登録します =="
while IFS= read -r line || [ -n "$line" ]; do
  # コメント行・空行をスキップ
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | tr -d '[:space:]')"
  # 値が空のもの（未使用のLINE系など）はスキップ
  if [ -z "$value" ]; then
    echo "  - $key は空のためスキップ"
    continue
  fi
  # 既存があれば消してから入れ直す（重複エラー回避）
  vercel env rm "$key" "$TARGET" -y >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" "$TARGET" >/dev/null
  echo "  ✓ $key を登録"
done < "$ENV_FILE"

echo "== 本番デプロイを開始します =="
vercel --prod

echo "完了しました。表示されたURLにアクセスして動作を確認してください。"
echo "次は管理画面にログインし、管理者パスワードの変更・店舗座標・スタッフ登録を行ってください。"
