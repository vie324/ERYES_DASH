// 依頼22（71）：スタッフ本人が自分のInstagram（プロアカウント）をつなぎ、毎日フォロワー数・投稿の数字を集める。
//  ・Instagramログインの公式API（Instagram API with Instagram Login）。本人がInstagramの画面で許可する
//  ・トークンは長期トークン（60日）。毎日の定期実行で期限が近いものを更新し、切れたら本人に「つなぎ直し」を知らせる
//  ・トークンは AUTH_SECRET から作った鍵で暗号化して保存する（画面・ログには出さない）
//  ・集める数字の名前（メトリクス）はMetaの変更が多いので、管理画面（/admin/instagram）で直せるようにする。
//    名前が使えなくなっていたら、その数字だけ飛ばして、ほかの数字は集め続ける
//  ・INSTAGRAM_APP_ID／INSTAGRAM_APP_SECRET が未設定の間は、つなぐボタンを出さない（デモでは見本の数字で試せる）

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { fx } from "@/lib/data/tables";
import type { InstagramAccount } from "@/lib/data/tables";
import { readJsonSetting } from "@/lib/feature-settings";
import { addDays, jstDayBoundsUtc, todayJst } from "@/lib/date";
import { notifyStaff } from "@/lib/notify";
import { DEMO_CAPTIONS, demoDay, seeded } from "./demo";
import type { DataStore } from "@/lib/data/types";

export interface InstagramSettings {
  /** Graph API の版（例：v24.0） */
  graphVersion: string;
  /** アカウントの1日の数字（metric_type=total_value・period=day で取る） */
  accountMetrics: string[];
  /** 投稿ごとの数字 */
  mediaMetrics: string[];
  /** 直近の投稿を何件見るか */
  mediaLimit: number;
  /** 画面に出す呼び名 */
  labels: Record<string, string>;
}

export const INSTAGRAM_SETTINGS_KEY = "instagram_settings";
// 数字の名前は Meta の公式のドキュメント（Instagram Account Insights／Instagram Media Insights。
// 2026-11-26 に確認・最新の版は v27.0）にある Instagram ログインで使えるもの。impressions は廃止済みなので使わない。
export const DEFAULT_INSTAGRAM_SETTINGS: InstagramSettings = {
  graphVersion: "v27.0",
  accountMetrics: ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "reposts", "profile_links_taps", "follows_and_unfollows"],
  mediaMetrics: ["views", "reach", "likes", "comments", "saved", "shares", "reposts", "total_interactions"],
  mediaLimit: 10,
  labels: {
    followers: "フォロワー",
    reach: "リーチ",
    views: "閲覧数",
    accounts_engaged: "反応した人",
    total_interactions: "反応の合計",
    likes: "いいね",
    comments: "コメント",
    shares: "シェア",
    saves: "保存",
    saved: "保存",
    reposts: "リポスト",
    profile_links_taps: "リンクのタップ",
    follows_and_unfollows: "フォロー・解除",
  },
};

export async function getInstagramSettings(db: DataStore): Promise<InstagramSettings> {
  const s = await readJsonSetting(db, INSTAGRAM_SETTINGS_KEY, DEFAULT_INSTAGRAM_SETTINGS);
  const list = (v: unknown, d: string[]) => (Array.isArray(v) ? v.map(String).filter((x) => /^[a-z0-9_]+$/.test(x)) : d);
  return {
    graphVersion: /^v\d{1,2}\.\d$/.test(String(s.graphVersion)) ? String(s.graphVersion) : DEFAULT_INSTAGRAM_SETTINGS.graphVersion,
    accountMetrics: list(s.accountMetrics, DEFAULT_INSTAGRAM_SETTINGS.accountMetrics),
    mediaMetrics: list(s.mediaMetrics, DEFAULT_INSTAGRAM_SETTINGS.mediaMetrics),
    mediaLimit: Math.min(25, Math.max(1, Number(s.mediaLimit) || DEFAULT_INSTAGRAM_SETTINGS.mediaLimit)),
    labels: { ...DEFAULT_INSTAGRAM_SETTINGS.labels, ...(s.labels && typeof s.labels === "object" ? s.labels : {}) },
  };
}

export function isInstagramConfigured(): boolean {
  return Boolean(env.instagramAppId && env.instagramAppSecret);
}

export function metricLabel(settings: InstagramSettings, key: string): string {
  return settings.labels[key] ?? key;
}

// ---------------------------------------------------------------- トークンの暗号化（AES-256-GCM）

function tokenKey(): Buffer {
  return createHash("sha256").update(`instagram-token-v1:${env.authSecret || "eryes-dev-secret-change-me"}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptToken(stored: string): string | null {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- つなぐ（本人が Instagram の画面で許可）

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];
export const STATE_COOKIE = "ig_oauth_state";

/** つなぐときの「合言葉」（本人のIDと時刻に署名。戻ってきたときに同じ人か確かめる） */
export function makeState(staffId: string): string {
  const body = `${staffId}.${Date.now()}.${randomBytes(9).toString("base64url")}`;
  const sig = createHmac("sha256", tokenKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [staffId, at, nonce, sig] = parts;
  const expect = createHmac("sha256", tokenKey()).update(`${staffId}.${at}.${nonce}`).digest("base64url");
  if (sig !== expect || Date.now() - Number(at) > 15 * 60_000) return null;
  return staffId;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  // パラメータは Meta の「Business Login for Instagram」のとおり（2026-11-26 に公式のドキュメントで確認）。
  // force_reauth=true：同じ端末でお店のアカウントにログインしていても、本人のアカウントで入り直してもらう
  const q = new URLSearchParams({
    enable_fb_login: "false",
    force_reauth: "true",
    client_id: env.instagramAppId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public expired: boolean
  ) {
    super(message);
  }
}

async function igFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };
  if (!res.ok || json.error) {
    const code = Number(json.error?.code ?? res.status);
    throw new InstagramApiError(json.error?.message ?? `Instagram API ${res.status}`, code, code === 190);
  }
  return json;
}

/** 認可コード → 短期トークン → 長期トークン（60日） */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ token: string; userId: string; expiresIn: number }> {
  const form = new URLSearchParams({
    client_id: env.instagramAppId,
    client_secret: env.instagramAppSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code: code.replace(/#_$/, ""),
  });
  const short = await igFetch<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body: form }
  );
  const s = short.data?.[0] ?? short;
  if (!s.access_token) throw new InstagramApiError("トークンを受け取れませんでした", 0, false);
  const long = await igFetch<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: env.instagramAppSecret, access_token: s.access_token })}`
  );
  return { token: long.access_token, userId: String(s.user_id ?? ""), expiresIn: Number(long.expires_in) || 60 * 24 * 3600 };
}

/** 長期トークンの更新（24時間以上たっていて、まだ切れていないもの） */
export async function refreshToken(token: string): Promise<{ token: string; expiresIn: number }> {
  const r = await igFetch<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`
  );
  return { token: r.access_token, expiresIn: Number(r.expires_in) || 60 * 24 * 3600 };
}

export interface Profile {
  userId: string;
  username: string;
  accountType: string;
  followers: number;
  follows: number;
  mediaCount: number;
}

export async function fetchProfile(token: string, version: string): Promise<Profile> {
  const r = await igFetch<{ user_id?: string; id?: string; username?: string; account_type?: string; followers_count?: number; follows_count?: number; media_count?: number }>(
    `https://graph.instagram.com/${version}/me?${new URLSearchParams({ fields: "user_id,username,account_type,followers_count,follows_count,media_count", access_token: token })}`
  );
  return {
    userId: String(r.user_id ?? r.id ?? ""),
    username: r.username ?? "",
    accountType: r.account_type ?? "",
    followers: Number(r.followers_count ?? 0),
    follows: Number(r.follows_count ?? 0),
    mediaCount: Number(r.media_count ?? 0),
  };
}

/** プロアカウント（ビジネス・クリエイター）か */
export function isProfessional(accountType: string): boolean {
  return ["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(accountType.toUpperCase());
}

type InsightRow = { name: string; total_value?: { value?: number }; values?: { value?: number | Record<string, number> }[] };

function valueOf(row: InsightRow): number {
  if (typeof row.total_value?.value === "number") return row.total_value.value;
  return (row.values ?? []).reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
}

/**
 * 数字をまとめて取り、名前が使えないなどで失敗したら1つずつ取り直す（使えない名前は failed に返す）。
 * 期限切れ（code 190）のときは、そのまま投げる。
 */
async function insightsWithFallback(base: string, metrics: string[], extra: Record<string, string>, token: string): Promise<{ values: Record<string, number>; failed: string[] }> {
  const run = async (ms: string[]) => {
    const r = await igFetch<{ data?: InsightRow[] }>(`${base}?${new URLSearchParams({ metric: ms.join(","), ...extra, access_token: token })}`);
    return Object.fromEntries((r.data ?? []).map((row) => [row.name, valueOf(row)]));
  };
  if (metrics.length === 0) return { values: {}, failed: [] };
  try {
    return { values: await run(metrics), failed: [] };
  } catch (e) {
    if (e instanceof InstagramApiError && e.expired) throw e;
    const values: Record<string, number> = {};
    const failed: string[] = [];
    for (const m of metrics) {
      try {
        Object.assign(values, await run([m]));
      } catch (e2) {
        if (e2 instanceof InstagramApiError && e2.expired) throw e2;
        failed.push(m);
      }
    }
    return { values, failed };
  }
}

/** その日（日本時間）のアカウントの数字 */
export async function fetchDayInsights(token: string, settings: InstagramSettings, date: string) {
  const { start, end } = jstDayBoundsUtc(date);
  return insightsWithFallback(
    `https://graph.instagram.com/${settings.graphVersion}/me/insights`,
    settings.accountMetrics,
    { period: "day", metric_type: "total_value", since: String(Math.floor(start.getTime() / 1000)), until: String(Math.floor(end.getTime() / 1000)) },
    token
  );
}

export interface MediaRow {
  id: string;
  caption: string;
  mediaType: string;
  permalink: string;
  postedAt: Date | null;
  metrics: Record<string, number>;
  failed: string[];
}

export async function fetchRecentMedia(token: string, settings: InstagramSettings): Promise<MediaRow[]> {
  const list = await igFetch<{ data?: { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }[] }>(
    `https://graph.instagram.com/${settings.graphVersion}/me/media?${new URLSearchParams({ fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: String(settings.mediaLimit), access_token: token })}`
  );
  const out: MediaRow[] = [];
  for (const m of list.data ?? []) {
    const { values, failed } = await insightsWithFallback(`https://graph.instagram.com/${settings.graphVersion}/${m.id}/insights`, settings.mediaMetrics, {}, token);
    out.push({
      id: m.id,
      // 投稿の文は見分けるための頭だけ（お客様のアカウント名などが入ることがあるので長く持たない）
      caption: (m.caption ?? "").replace(/\s+/g, " ").slice(0, 40),
      mediaType: m.media_product_type === "REELS" ? "REELS" : (m.media_type ?? ""),
      permalink: m.permalink ?? "",
      postedAt: m.timestamp ? new Date(m.timestamp) : null,
      metrics: { likes: m.like_count ?? 0, comments: m.comments_count ?? 0, ...values },
      failed,
    });
  }
  return out;
}

// ---------------------------------------------------------------- 毎日の集め方

/** 期限が近ければ更新（20日以内に切れる・最後の更新から24時間以上） */
export function needsRefresh(acc: Pick<InstagramAccount, "tokenExpiresAt" | "tokenRefreshedAt">, now = Date.now()): boolean {
  if (!acc.tokenExpiresAt) return true;
  const soon = acc.tokenExpiresAt.getTime() - now < 20 * 24 * 3600_000;
  const old = !acc.tokenRefreshedAt || now - acc.tokenRefreshedAt.getTime() > 24 * 3600_000;
  return soon && old;
}

async function markProblem(db: DataStore, acc: InstagramAccount, status: "expired" | "error", message: string) {
  await fx().instagramAccounts.update(acc.id, { status, lastError: message.slice(0, 300) });
  // 知らせるのは、使えなくなったときの1回だけ
  if (acc.status === "active") {
    await notifyStaff(db, [acc.staffId], {
      kind: "instagram",
      title: "Instagramのつなぎ直しが必要です",
      body: status === "expired" ? "許可の期限が切れました。アプリからもう一度つないでください" : "数字を読めませんでした。アプリからもう一度つないでください",
      href: "/staff/instagram",
      refId: acc.id,
    });
  }
}

/** 1人分を集める（date＝数字を集める日。毎朝、前の日の分） */
export async function syncAccount(db: DataStore, acc: InstagramAccount, date: string): Promise<string> {
  const f = fx();
  if (acc.status === "demo") {
    await addDemoDay(acc, date);
    return "demo";
  }
  if (acc.status === "disconnected") return "skip";
  let token = decryptToken(acc.tokenEnc);
  if (!token) {
    await markProblem(db, acc, "error", "トークンを読めませんでした");
    return "error";
  }
  const settings = await getInstagramSettings(db);
  try {
    if (needsRefresh(acc)) {
      const r = await refreshToken(token);
      token = r.token;
      await f.instagramAccounts.update(acc.id, { tokenEnc: encryptToken(token), tokenExpiresAt: new Date(Date.now() + r.expiresIn * 1000), tokenRefreshedAt: new Date() });
    }
    const profile = await fetchProfile(token, settings.graphVersion);
    const day = await fetchDayInsights(token, settings, date);
    await f.instagramDaily.upsert(
      { staffId: acc.staffId, accountId: acc.id, date, followers: profile.followers, follows: profile.follows, mediaCount: profile.mediaCount, metrics: day.values },
      ["accountId", "date"]
    );
    const media = await fetchRecentMedia(token, settings);
    for (const m of media) {
      await f.instagramMedia.upsert(
        { staffId: acc.staffId, accountId: acc.id, mediaId: m.id, caption: m.caption, mediaType: m.mediaType, permalink: m.permalink, postedAt: m.postedAt, metrics: m.metrics, fetchedAt: new Date() },
        ["accountId", "mediaId"]
      );
    }
    const failed = [...new Set([...day.failed, ...media.flatMap((m) => m.failed)])];
    await f.instagramAccounts.update(acc.id, {
      status: "active",
      username: profile.username || acc.username,
      accountType: profile.accountType || acc.accountType,
      lastFetchedAt: new Date(),
      lastError: failed.length ? `使えない数字の名前：${failed.join(", ")}（管理画面で直せます）` : "",
    });
    return "ok";
  } catch (e) {
    const expired = e instanceof InstagramApiError && e.expired;
    await markProblem(db, acc, expired ? "expired" : "error", e instanceof Error ? e.message : String(e));
    return expired ? "expired" : "error";
  }
}

/** 毎朝の定期実行：つないでいる全員の、前の日の数字 */
export async function instagramSyncJob(db: DataStore, today: string): Promise<string> {
  const accounts = await fx().instagramAccounts.list({ where: { status: { in: ["active", "demo", "error"] } } });
  const date = addDays(today, -1);
  const results: string[] = [];
  for (const acc of accounts) results.push(await syncAccount(db, acc, date));
  const count = (k: string) => results.filter((r) => r === k).length;
  return `${accounts.length}人（取れた ${count("ok") + count("demo")}・期限切れ ${count("expired")}・失敗 ${count("error")}）`;
}

// ---------------------------------------------------------------- デモ（Instagram のアプリが未設定のとき、見本の数字で試す）

async function addDemoDay(acc: InstagramAccount, date: string) {
  const rows = await fx().instagramDaily.list({ where: { accountId: acc.id }, order: [["date", "desc"]], limit: 1 });
  const base = rows[0]?.followers ?? 800;
  const d = demoDay(acc.staffId, date, base, 1);
  await fx().instagramDaily.upsert({ staffId: acc.staffId, accountId: acc.id, date, ...d }, ["accountId", "date"]);
  await fx().instagramAccounts.update(acc.id, { lastFetchedAt: new Date() });
}

/** 見本のアカウントをつなぐ（30日分の数字と、最近の投稿6件） */
export async function connectDemoAccount(staffId: string, username: string, base = 800): Promise<InstagramAccount> {
  const f = fx();
  const today = todayJst();
  const existing = await f.instagramAccounts.find({ staffId });
  const acc = existing
    ? ((await f.instagramAccounts.update(existing.id, { status: "demo", username, lastError: "", connectedAt: new Date() })) ?? existing)
    : await f.instagramAccounts.insert({ staffId, igUserId: `demo-${staffId}`, username, accountType: "MEDIA_CREATOR", tokenEnc: "", status: "demo", connectedAt: new Date(), lastFetchedAt: new Date() });
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 30));
  await f.instagramDaily.insertMany(days.map((date, i) => ({ staffId, accountId: acc.id, date, ...demoDay(staffId, date, base, i) })));
  const rnd = seeded(staffId);
  await f.instagramMedia.insertMany(
    DEMO_CAPTIONS.map((caption, i) => {
      const views = Math.round(base * (1 + rnd() * 3));
      return {
        staffId,
        accountId: acc.id,
        mediaId: `demo-${staffId}-${i}`,
        caption,
        mediaType: i % 2 === 0 ? "REELS" : "CAROUSEL_ALBUM",
        permalink: "",
        postedAt: new Date(Date.now() - (i * 4 + 1) * 24 * 3600_000),
        metrics: { views, reach: Math.round(views * 0.6), likes: Math.round(views * 0.06), comments: Math.round(rnd() * 8), saved: Math.round(rnd() * 20), shares: Math.round(rnd() * 10) },
        fetchedAt: new Date(),
      };
    })
  );
  return acc;
}

// ---------------------------------------------------------------- 画面用のまとめ

export interface AccountSummary {
  account: InstagramAccount;
  latest: { date: string; followers: number; metrics: Record<string, number> } | null;
  followersChange30: number | null;
  sum30: Record<string, number>;
}

export async function summarizeAccounts(accounts: InstagramAccount[]): Promise<Map<string, AccountSummary>> {
  const from = addDays(todayJst(), -31);
  const rows = accounts.length ? await fx().instagramDaily.list({ where: { accountId: { in: accounts.map((a) => a.id) }, date: { gte: from } }, order: [["date", "asc"]] }) : [];
  const out = new Map<string, AccountSummary>();
  for (const a of accounts) {
    const mine = rows.filter((r) => r.accountId === a.id);
    const last = mine[mine.length - 1];
    const sum30: Record<string, number> = {};
    for (const r of mine) for (const [k, v] of Object.entries(r.metrics ?? {})) sum30[k] = (sum30[k] ?? 0) + (Number(v) || 0);
    out.set(a.staffId, {
      account: a,
      latest: last ? { date: last.date, followers: last.followers, metrics: last.metrics ?? {} } : null,
      followersChange30: mine.length >= 2 ? last.followers - mine[0].followers : null,
      sum30,
    });
  }
  return out;
}
