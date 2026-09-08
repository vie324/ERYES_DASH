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

  // Web Push（トーク・タスクの通知とアプリアイコンのバッジ）。未設定なら通知機能は出ない
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "",
};

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
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/** LINE Messaging API が設定済みか（false の場合は送信をモックする） */
export function isLineConfigured(): boolean {
  return Boolean(env.lineChannelAccessToken);
}
