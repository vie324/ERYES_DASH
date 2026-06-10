// 日付ユーティリティ。サーバーがUTCで動く（Vercel）前提のため、
// 業務上の「日付」はすべて日本時間（JST, UTC+9固定）で扱う。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → JSTの "YYYY-MM-DD" */
export function toJstDateString(d: Date): string {
  const t = new Date(d.getTime() + JST_OFFSET_MS);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const day = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今日（JST）の "YYYY-MM-DD" */
export function todayJst(): string {
  return toJstDateString(new Date());
}

/** 今月（JST）の "YYYY-MM" */
export function thisMonthJst(): string {
  return todayJst().slice(0, 7);
}

/** "YYYY-MM-DD" にn日加算 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM" にnヶ月加算 */
export function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" の月初日〜月末日（"YYYY-MM-DD"） */
export function monthRange(monthStr: string): { from: string; to: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${monthStr}-01`, to: `${monthStr}-${String(last).padStart(2, "0")}` };
}

/** JSTの日付 "YYYY-MM-DD" の0:00と24:00をUTCのDateで返す（タイムスタンプ範囲検索用） */
export function jstDayBoundsUtc(dateStr: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - JST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** タイムスタンプ（Date）が属するJSTの日付 "YYYY-MM-DD" */
export function jstDateOf(d: Date): string {
  return toJstDateString(d);
}

/** JSTのローカル日時 "YYYY-MM-DDTHH:mm"（datetime-local入力値）→ UTC Date */
export function jstLocalToUtc(localStr: string): Date {
  return new Date(new Date(`${localStr}:00Z`).getTime() - JST_OFFSET_MS);
}

/** UTC Date → JSTの "YYYY-MM-DDTHH:mm"（datetime-local入力の初期値用） */
export function utcToJstLocal(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 16);
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "6月10日(水)" のような日本語表記 */
export function formatDateJa(dateStr: string, withYear = false): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const w = WEEKDAYS_JA[d.getUTCDay()];
  const base = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${w})`;
  return withYear ? `${d.getUTCFullYear()}年${base}` : base;
}

/** UTC Date → JSTの "6月10日(水) 14:00" 表記 */
export function formatDateTimeJa(d: Date, withYear = false): string {
  const t = new Date(d.getTime() + JST_OFFSET_MS);
  const dateStr = t.toISOString().slice(0, 10);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${formatDateJa(dateStr, withYear)} ${hh}:${mm}`;
}

/** UTC Date → JSTの "HH:mm" */
export function formatTimeJa(d: Date): string {
  const t = new Date(d.getTime() + JST_OFFSET_MS);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "YYYY-MM" → "2026年6月" */
export function formatMonthJa(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return `${y}年${m}月`;
}
