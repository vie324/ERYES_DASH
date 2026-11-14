// イーリスの予約LINE（ENiの要望81）：次回予約（next_appointments）をもとに、お客様へLINEでお知らせする。
//  ・予約完了のお知らせ …… 予約を登録したとき（送れなかった分は、次の定時実行でもう一度）
//  ・3日前のお知らせ／前日の確認（／1週間前の案内：初期値は止めている）…… 定時実行で、管理画面で選んだ時刻に
//  ・「予約確認」と送られたら、そのLINEのお客様の次の予約を返す（webhook）
// 文面・送る時刻・合言葉は管理画面（次回予約・リマインド → LINEのお知らせの設定）で変えられる（app_settings の line_notice_settings）。
// 送った記録は appointment_notice_logs に1回＝1行で残し、同じお知らせは二重に送らない（予約×種類×予約日時で1回）。
// LINEのキー（LINE_CHANNEL_ACCESS_TOKEN）が未設定なら、実際には送らない（モック。記録には「モック」と残る）。
//
// お客様に関わる部分（予約のお知らせ・「予約確認」への返事・電話番号のお願い）は、
// 「お客様へのLINE」のスイッチ（enabled）でまとめてオン・オフする。初期値はオフ。
// オフの間は、これまでどおり「お名前の登録」と「自動の返信」だけが動き、お知らせは送らない。

import { pushText, lineMode } from "@/lib/line/client";
import { env, isLineConfigured } from "@/lib/env";
import { addDays, formatDateTimeJa, jstDayBoundsUtc } from "@/lib/date";
import type {
  AppointmentNoticeKind,
  Customer,
  DataStore,
  NextAppointment,
} from "@/lib/data/types";

export const LINE_NOTICE_SETTINGS_KEY = "line_notice_settings";

/** 送る時刻の選択肢（日本時間。vercel.json にこの時刻の定時実行を1日1回ずつ登録してある） */
export const NOTICE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

/** 定時実行で送る種類（予約完了は登録したときに送る） */
export const SCHEDULED_KINDS = ["three_days", "day_before", "week_before"] as const;
export type ScheduledKind = (typeof SCHEDULED_KINDS)[number];

/** 予約日の何日前に送るか */
export const DAYS_BEFORE: Record<ScheduledKind, number> = { three_days: 3, day_before: 1, week_before: 7 };

export const NOTICE_LABEL: Record<AppointmentNoticeKind, string> = {
  completion: "予約完了のお知らせ",
  three_days: "3日前のお知らせ",
  day_before: "前日の確認",
  week_before: "1週間前の案内",
};

export interface ScheduledNoticeSetting {
  enabled: boolean;
  /** 送る時刻（日本時間の時） */
  hour: number;
  template: string;
}

export interface LineNoticeSettings {
  /**
   * お客様へのLINE（予約のお知らせ・「予約確認」への返事・電話番号のお願い）をまとめてオンにするか。
   * 初期値はオフ（ENiに説明してから、管理者が画面でオンにする）
   */
  enabled: boolean;
  completion: { enabled: boolean; template: string };
  three_days: ScheduledNoticeSetting;
  day_before: ScheduledNoticeSetting;
  week_before: ScheduledNoticeSetting;
  /** 「予約確認」の合言葉（このどれかと同じ言葉が送られたら、次の予約を返す） */
  keywords: string[];
  /** 予約確認の返事（予約があるとき） */
  replyFound: string;
  /** 予約確認の返事（予約がないとき・LINEとまだつながっていないとき） */
  replyNone: string;
  /** お名前の登録のあとに、電話番号をお願いする文 */
  askPhone: string;
  /** 電話番号を受け取ったときの返事 */
  phoneSaved: string;
}

/** 文面に使える差し込み */
export const NOTICE_PLACEHOLDERS = [
  { key: "{お名前}", note: "お客様のお名前" },
  { key: "{日時}", note: "ご予約の日時（例：11月17日(火) 14:00）" },
  { key: "{店舗名}", note: "店舗の名前" },
  { key: "{確認の案内}", note: "予約の確認・変更の案内（LIFFのリンク、または「予約確認」と送る案内）" },
  { key: "{予約一覧}", note: "（予約確認の返事だけ）これからのご予約の一覧" },
];

export const DEFAULT_LINE_NOTICE_SETTINGS: LineNoticeSettings = {
  enabled: false,
  completion: {
    enabled: true,
    template:
      "【{店舗名}】ご予約ありがとうございます\n{お名前} 様\n\n{日時} のご予約を承りました。\nご来店を心よりお待ちしております。\n\n{確認の案内}",
  },
  three_days: {
    enabled: true,
    hour: 19,
    template:
      "【{店舗名}】ご予約のご案内\n{お名前} 様\n\n3日後の {日時} にご予約をいただいております。\nご都合が変わられた場合は、お早めにご連絡ください。\n\n{確認の案内}",
  },
  day_before: {
    enabled: true,
    hour: 19,
    template:
      "【{店舗名}】ご予約の確認\n{お名前} 様\n\n明日 {日時} にご予約をいただいております。\nお気をつけてお越しください。\n\n{確認の案内}",
  },
  week_before: {
    enabled: false,
    hour: 19,
    template:
      "【{店舗名}】ご予約のご案内\n{お名前} 様\n\n1週間後の {日時} にご予約をいただいております。\nご都合が変わられた場合は、お早めにご変更・キャンセルをお願いいたします。\n\n{確認の案内}",
  },
  keywords: ["予約確認"],
  replyFound: "【{店舗名}】ご予約の確認\n{お名前} 様\n\n{予約一覧}\n\n{確認の案内}",
  replyNone:
    "現在、こちらのLINEでお調べできるご予約はありません。\nご予約済みの場合は、お手数ですが店舗までお問い合わせください。",
  askPhone: "ご予約の確認やお知らせのため、ご予約時のお電話番号もこのトークに送ってください。（例：090-1234-5678）",
  phoneSaved:
    "お電話番号を登録しました。\nご予約の確認は「予約確認」と送るか、メニューの「予約確認」を押してください。",
};

const TEXT_MAX = 1000;

function text(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.replace(/\r\n?/g, "\n").slice(0, TEXT_MAX) : fallback;
}

function hour(v: unknown, fallback: number): number {
  const n = Number(v);
  return NOTICE_HOURS.includes(n) ? n : fallback;
}

/** 保存された設定を読む（足りない・おかしな値は初期値で埋める） */
export function parseLineNoticeSettings(raw: string | undefined | null): LineNoticeSettings {
  const d = DEFAULT_LINE_NOTICE_SETTINGS;
  let p: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") p = parsed as Record<string, unknown>;
  } catch {
    // 壊れた設定は初期値に戻す
  }
  const obj = (k: string) => (p[k] && typeof p[k] === "object" ? (p[k] as Record<string, unknown>) : {});
  const scheduled = (k: ScheduledKind): ScheduledNoticeSetting => ({
    enabled: typeof obj(k).enabled === "boolean" ? (obj(k).enabled as boolean) : d[k].enabled,
    hour: hour(obj(k).hour, d[k].hour),
    template: text(obj(k).template, d[k].template),
  });
  const keywords = Array.isArray(p.keywords)
    ? normalizeKeywords(p.keywords.map(String))
    : d.keywords;
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : d.enabled,
    completion: {
      enabled: typeof obj("completion").enabled === "boolean" ? (obj("completion").enabled as boolean) : d.completion.enabled,
      template: text(obj("completion").template, d.completion.template),
    },
    three_days: scheduled("three_days"),
    day_before: scheduled("day_before"),
    week_before: scheduled("week_before"),
    keywords: keywords.length > 0 ? keywords : d.keywords,
    replyFound: text(p.replyFound, d.replyFound),
    replyNone: text(p.replyNone, d.replyNone),
    askPhone: text(p.askPhone, d.askPhone),
    phoneSaved: text(p.phoneSaved, d.phoneSaved),
  };
}

/** 保存されている設定を読む */
export async function getLineNoticeSettings(db: DataStore): Promise<LineNoticeSettings> {
  const rows = await db.listAppSettings();
  return parseLineNoticeSettings(rows.find((r) => r.key === LINE_NOTICE_SETTINGS_KEY)?.value);
}

/** 合言葉をそろえる（前後の空白を取り、空と重複を捨てる。10個まで） */
export function normalizeKeywords(list: string[]): string[] {
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))].slice(0, 10).map((k) => k.slice(0, 30));
}

/** 送られた言葉が「予約確認」の合言葉か（空白・全角半角の違いは気にしない） */
export function isReservationKeyword(message: string, keywords: string[]): boolean {
  const norm = (t: string) => t.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const m = norm(message);
  return m !== "" && keywords.some((k) => norm(k) === m);
}

/** 予約の確認・変更の案内（LIFFがあればリンク。なければトークでの案内） */
export function selfServiceText(): string {
  if (env.liffAppointmentId) {
    return `▼ご予約の確認・変更・キャンセルはこちら\nhttps://liff.line.me/${env.liffAppointmentId}`;
  }
  if (!isLineConfigured()) {
    // デモ（LINE未設定）：直接のURLで動作確認できるようにする
    return `▼ご予約の確認・変更・キャンセルはこちら\n${env.appUrl}/liff/appointment`;
  }
  return "※ご予約の確認は「予約確認」と送ってください。ご変更・キャンセルはこのトークにご返信ください。";
}

/** 文面に差し込む */
export function renderNotice(
  template: string,
  vars: { name: string; when?: string; store: string; list?: string; selfService?: string }
): string {
  return template
    .replaceAll("{お名前}", vars.name)
    .replaceAll("{日時}", vars.when ?? "")
    .replaceAll("{店舗名}", vars.store)
    .replaceAll("{予約一覧}", vars.list ?? "")
    .replaceAll("{確認の案内}", vars.selfService ?? selfServiceText())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 電話番号をそろえる（全角・ハイフン・空白・+81 を直して数字だけに）。電話番号らしくなければ空文字 */
export function normalizePhone(input: string): string {
  let t = input.normalize("NFKC").replace(/[\s\-‐－ー−()（）.]/g, "");
  if (t.startsWith("+81")) t = `0${t.slice(3)}`;
  return /^0\d{9,10}$/.test(t) ? t : "";
}

/** 画面に出すときの電話番号（下4桁だけ見せる） */
export function maskPhone(phone: string): string {
  return phone ? `•••-${phone.slice(-4)}` : "";
}

/** 名前の比べ方（空白・全角半角の違いは気にしない） */
export function sameName(a: string, b: string): boolean {
  const norm = (t: string) => t.normalize("NFKC").replace(/\s+/g, "");
  return norm(a) !== "" && norm(a) === norm(b);
}

/**
 * LINEとつなぐ候補：店舗が入れた「LINE未連携」のお客様と、同じ電話番号のLINEのお客様の組。
 * 電話番号だけでは本人と言い切れないので、自動ではつながない（店舗が確かめて「つなぐ」を押す）。
 */
export function linkCandidates(customers: Customer[]): { lineCustomer: Customer; unlinked: Customer; nameMatches: boolean }[] {
  const withLine = customers.filter((c) => c.lineUserId && c.phone);
  const result: { lineCustomer: Customer; unlinked: Customer; nameMatches: boolean }[] = [];
  for (const unlinked of customers.filter((c) => !c.lineUserId && c.phone)) {
    for (const lineCustomer of withLine.filter((c) => c.phone === unlinked.phone)) {
      result.push({ lineCustomer, unlinked, nameMatches: sameName(lineCustomer.fullName, unlinked.fullName) });
    }
  }
  return result;
}

/** これからのご予約（キャンセルを除く）を一覧の文にする */
export function appointmentListText(appointments: NextAppointment[]): string {
  return appointments.map((a) => `・${formatDateTimeJa(a.scheduledAt, true)}${a.status === "change_requested" ? "（変更のご希望を確認中）" : ""}`).join("\n");
}

export type NoticeResult = "sent" | "failed" | "skipped" | "duplicate" | "off";

/**
 * 予約1件に、お知らせを1つ送る。
 * 送信の札（appointment_notice_logs の sending 行）が取れたときだけ送るので、同じお知らせは二重に送らない。
 * お客様がLINEとつながっていなければ送らず「送らなかった」を1回だけ記録する。
 */
export async function sendAppointmentNotice(
  db: DataStore,
  input: {
    appointment: NextAppointment;
    customer: Customer | null;
    kind: AppointmentNoticeKind;
    template: string;
    storeName: string;
  }
): Promise<NoticeResult> {
  const { appointment, customer, kind } = input;
  if (appointment.status === "cancelled") return "off";
  const key = { appointmentId: appointment.id, customerId: appointment.customerId, kind, scheduledFor: appointment.scheduledAt };
  if (!customer?.lineUserId) {
    await db.logSkippedAppointmentNotice({ ...key, error: "LINE未連携のお客様（送っていません）" });
    return "skipped";
  }
  const claim = await db.claimAppointmentNotice(key);
  if (!claim) return "duplicate";
  const body = renderNotice(input.template, {
    name: customer.fullName,
    when: formatDateTimeJa(appointment.scheduledAt, kind !== "day_before"),
    store: input.storeName,
  });
  let ok = false;
  let error = "";
  try {
    ok = await pushText(customer.lineUserId, body);
    if (!ok) error = "LINEへの送信に失敗しました（次の定時実行でもう一度送ります）";
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await db.finishAppointmentNotice(claim.id, { status: ok ? "sent" : "failed", mode: lineMode(), body, error });
  if (ok) {
    // これまでの画面（前日リマインド・1週間前案内の送信済み表示）とそろえる
    if (kind === "day_before") await db.markReminderSent(appointment.id, new Date());
    if (kind === "week_before") await db.markPreReminderSent(appointment.id, new Date());
  }
  return ok ? "sent" : "failed";
}

/** 予約を登録したときの「予約完了のお知らせ」 */
export async function sendCompletionNotice(
  db: DataStore,
  appointment: NextAppointment,
  settings: LineNoticeSettings
): Promise<NoticeResult> {
  if (!settings.enabled || !settings.completion.enabled) return "off";
  if (appointment.scheduledAt.getTime() <= Date.now()) return "off";
  const [customer, store] = await Promise.all([db.getCustomer(appointment.customerId), db.getStore()]);
  return sendAppointmentNotice(db, {
    appointment,
    customer,
    kind: "completion",
    template: settings.completion.template,
    storeName: store.name,
  });
}

/** 予約完了のお知らせを、もう一度送ってみる対象（登録から何時間以内か） */
export const COMPLETION_RETRY_HOURS = 48;

export interface NoticeRunSummary {
  kind: AppointmentNoticeKind;
  targets: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * 定時実行（1時間ごとの枠のどれか）での送信。
 *  ・3日前／前日／1週間前：その種類の「送る時刻」を過ぎた枠で、対象日の予約に送る（後の枠は取りこぼしの拾い直し。札で二重送信はしない）
 *  ・予約完了：登録から48時間以内で、まだ届いていない分をもう一度（LINEとつながった・送信に失敗した など）
 */
export async function runScheduledNotices(
  db: DataStore,
  input: { today: string; slotHour: number; settings: LineNoticeSettings; now?: Date }
): Promise<NoticeRunSummary[]> {
  const { today, slotHour, settings } = input;
  // お客様へのLINEがオフの間は、何も送らない
  if (!settings.enabled) return [];
  const now = input.now ?? new Date();
  const store = await db.getStore();
  const customerCache = new Map<string, Customer | null>();
  const customerOf = async (id: string) => {
    if (!customerCache.has(id)) customerCache.set(id, await db.getCustomer(id));
    return customerCache.get(id) ?? null;
  };
  const summaries: NoticeRunSummary[] = [];
  const tally = async (kind: AppointmentNoticeKind, targets: NextAppointment[], template: string) => {
    const row: NoticeRunSummary = { kind, targets: targets.length, sent: 0, skipped: 0, failed: 0 };
    for (const appointment of targets) {
      const result = await sendAppointmentNotice(db, {
        appointment,
        customer: await customerOf(appointment.customerId),
        kind,
        template,
        storeName: store.name,
      });
      if (result === "sent") row.sent++;
      else if (result === "skipped") row.skipped++;
      else if (result === "failed") row.failed++;
    }
    summaries.push(row);
  };

  for (const kind of SCHEDULED_KINDS) {
    const setting = settings[kind];
    if (!setting.enabled || slotHour < setting.hour) continue;
    const day = jstDayBoundsUtc(addDays(today, DAYS_BEFORE[kind]));
    const targets = (await db.listNextAppointments({ from: day.start, to: day.end })).filter((a) => a.status !== "cancelled");
    await tally(kind, targets, setting.template);
  }

  if (settings.completion.enabled) {
    const since = now.getTime() - COMPLETION_RETRY_HOURS * 3600e3;
    const upcoming = (await db.listNextAppointments({ from: now })).filter(
      (a) => a.status !== "cancelled" && a.createdAt.getTime() >= since
    );
    await tally("completion", upcoming, settings.completion.template);
  }
  return summaries;
}

/** 定時実行の式（"0 10 * * *" など・UTC）から日本時間の時を出す */
export function jstHourFromSchedule(schedule: string | null): number | null {
  if (!schedule) return null;
  const parts = schedule.trim().split(/\s+/);
  const h = Number(parts[1]);
  if (parts.length < 5 || !Number.isInteger(h) || h < 0 || h > 23) return null;
  return (h + 9) % 24;
}
