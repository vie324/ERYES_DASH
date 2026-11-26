// 環境変数の集約。未設定の項目はデモモード（モック）で動作させる。

export const env = {
  authSecret: process.env.AUTH_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  lineChannelId: process.env.LINE_CHANNEL_ID || "",
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || "",
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  liffId: process.env.NEXT_PUBLIC_LIFF_ID || "",
  // 予約確認・変更用のLIFFアプリ（エンドポイント: /liff/appointment）。未設定でも他機能は動く
  liffAppointmentId: process.env.NEXT_PUBLIC_LIFF_APPOINTMENT_ID || "",

  // 議事録のAI整形（Anthropic）。未設定時はテンプレ整形にフォールバック
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5",
  // AIしもん（スタッフの壁打ち相談）。しもん側の推奨に合わせて既定は Sonnet（品質と費用のバランス）
  aiShimonModel: process.env.AI_SHIMON_MODEL || "claude-sonnet-5",
  // ホームの朝の画面「今日のタスク」（1人1日1回だけ作る）。同じ ANTHROPIC_API_KEY を使う。
  // 未設定なら ANTHROPIC_MODEL（議事録のAI整形と同じモデル）を使う
  homeBriefModel: process.env.HOME_BRIEF_MODEL || "",

  // Web Push（トーク・タスクの通知とアプリアイコンのバッジ）。未設定なら通知機能は出ない
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "",

  // ---- 2026-11 依頼10〜23 ----
  // 追加したAIの機能（Wiki検索・今週やること）のモデル。CLAUDE.md の決まりどおり、未設定ならAIしもんと同じモデル
  aiToolsModel: process.env.AI_TOOLS_MODEL || process.env.AI_SHIMON_MODEL || "claude-sonnet-5",
  // SalonOne（2027年1月から予約・会計）。API仕様が届くまでは未設定のまま（手入力・日報で動く）
  salonOneApiBase: process.env.SALONONE_API_BASE || "",
  salonOneApiKey: process.env.SALONONE_API_KEY || "",
  // カリキュラム動画の配信（推奨：Cloudflare Stream）。未設定なら Supabase Storage の非公開バケットを使う
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  cloudflareStreamToken: process.env.CLOUDFLARE_STREAM_TOKEN || "",
  cloudflareStreamCustomerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || "",
  videoBucket: process.env.SUPABASE_VIDEO_BUCKET || "curriculum-videos",
  // Instagram（Instagramログインで使うAPI）。Metaのアプリの「Instagram アプリID・シークレット」
  instagramAppId: process.env.INSTAGRAM_APP_ID || "",
  instagramAppSecret: process.env.INSTAGRAM_APP_SECRET || "",
};

/**
 * デモモードを強制するか（DEMO_MODE=1）。
 * プレビュー（Vercel の Preview）は本番と同じ Supabase につながっているため、
 * 本番のデータに触らずに新しい機能を試したいときは、Preview の環境変数にだけ DEMO_MODE=1 を入れる。
 */
export function isForcedDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** Web Push が使えるか（VAPID鍵が設定済みか） */
export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

/** 議事録のAI整形が使えるか（Anthropic APIキーが設定済みか） */
export function isAnthropicConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/** Supabase が設定済みか（false の場合はメモリ内デモデータで動作） */
export function isSupabaseConfigured(): boolean {
  if (isForcedDemoMode()) return false;
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/** LINE Messaging API が設定済みか（false の場合は送信をモックする） */
export function isLineConfigured(): boolean {
  return Boolean(env.lineChannelAccessToken);
}
