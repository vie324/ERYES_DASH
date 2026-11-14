// 毎朝のリマインド（今日の未完了のタスク・ルーティン／未読のトーク）を「いつ送るか」の判定。
// vercel.json に、送れる時刻（日本時間 6〜12時）ごとの定時実行を1日1回ずつ登録しておき、
// マスタ設定で選んだ時刻の回だけ実際に送る（Vercelの無料プランは「1日1回の定時実行」しか置けないため）。

/** その日のリマインドを送ったか（app_settings に日付を残して、1日1回にする） */
export const MORNING_REMINDER_SENT_KEY = "_morning_reminder_sent_on";

/**
 * 定時実行の式（x-vercel-cron-schedule。UTCで書いてある "分 時 * * *"）から、日本時間の「時」を出す。
 * 読めないときは null（手で呼んだときなど）。
 */
export function jstHourFromCronSchedule(schedule: string | null | undefined): number | null {
  if (!schedule) return null;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const hour = Number(parts[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return (hour + 9) % 24;
}

/** いまの日本時間の「時」 */
export function currentJstHour(now: Date = new Date()): number {
  return (now.getUTCHours() + 9) % 24;
}

/**
 * この回で送るか。
 *  ・選んだ時刻より前の回は送らない
 *  ・選んだ時刻の回で送る（その回が届かなかった・時刻をあとから早めた、ときは次の回で送る）
 *  ・その日すでに送っていれば送らない（同じ回が2回呼ばれても1回だけ）
 */
export function shouldSendMorningReminder(input: {
  slotHour: number;
  configuredHour: number;
  lastSentOn: string;
  today: string;
}): boolean {
  if (input.lastSentOn === input.today) return false;
  return input.slotHour >= input.configuredHour;
}
