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
};

/** Supabase が設定済みか（false の場合はメモリ内デモデータで動作） */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/** LINE Messaging API が設定済みか（false の場合は送信をモックする） */
export function isLineConfigured(): boolean {
  return Boolean(env.lineChannelAccessToken);
}
