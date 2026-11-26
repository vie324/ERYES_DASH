// 依頼20（75）：カリキュラム動画を、アプリの中でしか見られないようにする。
//
// 配信サービスの比べ方（費用・ダウンロードの防ぎやすさ）と推奨：
//  ・Cloudflare Stream（推奨） …… 保存1,000分あたり月$5・配信1,000分あたり$1ほど。HLS（細切れの配信）なので、
//       ファイルを丸ごと保存しにくい。署名つきのトークン（期限つき）で配信でき、「ダウンロード」は既定で無効
//  ・Mux …… 似た仕組み（HLS・署名つき再生）。小さな規模では Cloudflare より割高になりやすい
//  ・Supabase Storage …… 今の Supabase に入っていて追加の契約が要らない。期限つきの署名URLで配信できるが、
//       MP4をそのまま送るので、URLが生きている間は保存できてしまう（防ぎやすさは一段下）
// → Cloudflare Stream で作る。環境変数（CLOUDFLARE_*）が未設定の間は、Supabase Storage（非公開のバケット）で配信し、
//   どちらも無いデモでは、試し用の動画のURLで動く（そのときは画面に「保護されていません」と出す）。
//
// どの方法でも、再生のURLはログインしたスタッフにだけ、短い期限つきで出す（/api/curriculum/video/[id]/play）。
// 画面録画を完全に止めることはWebアプリではできないので、再生中は見ている人の名前を薄く重ねて出す（components/video）。

import { createClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { CurriculumVideo, VideoProvider } from "@/lib/data/tables";

export function isCloudflareConfigured(): boolean {
  return Boolean(env.cloudflareAccountId && env.cloudflareStreamToken && env.cloudflareStreamCustomerCode);
}

/** 新しく上げる動画の置き場所（推奨の Cloudflare → Supabase → 試し用URLだけ） */
export function uploadProvider(): VideoProvider {
  if (isCloudflareConfigured()) return "cloudflare";
  if (isSupabaseConfigured()) return "supabase";
  return "url";
}

export interface PlaySource {
  kind: "hls" | "mp4";
  src: string;
  /** このURLが使えなくなる時刻 */
  expiresAt: number;
  /** 保護されていない（試し用のURL） */
  unprotected: boolean;
}

const CF_API = "https://api.cloudflare.com/client/v4";

async function cloudflare<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CF_API}/accounts/${env.cloudflareAccountId}/stream${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.cloudflareStreamToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string }[] };
  if (!res.ok || !json.success || !json.result) throw new Error(`Cloudflare Stream: ${json.errors?.[0]?.message ?? res.status}`);
  return json.result;
}

function supabase() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
}

/**
 * 再生のURLを作る（ログインしたスタッフにだけ。期限つき）。
 *  ・Cloudflare：署名つきトークン（2時間）。動画は requireSignedURLs で上げてあるので、トークンが無いと再生できない
 *  ・Supabase：署名つきURL（動画の長さ＋10分。MP4は再生中にも何度も読みに来るため、短すぎると途中で止まる）
 */
export async function playSourceFor(video: Pick<CurriculumVideo, "provider" | "providerRef" | "durationSec">): Promise<PlaySource> {
  const now = Date.now();
  if (video.provider === "cloudflare") {
    const exp = Math.floor(now / 1000) + 2 * 3600;
    const { token } = await cloudflare<{ token: string }>(`/${encodeURIComponent(video.providerRef)}/token`, {
      method: "POST",
      body: JSON.stringify({ exp, downloadable: false }),
    });
    return { kind: "hls", src: `https://customer-${env.cloudflareStreamCustomerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`, expiresAt: exp * 1000, unprotected: false };
  }
  if (video.provider === "supabase") {
    const seconds = Math.max(600, (video.durationSec || 1800) + 600);
    const { data, error } = await supabase().storage.from(env.videoBucket).createSignedUrl(video.providerRef, seconds);
    if (error || !data?.signedUrl) throw new Error(`Supabase Storage: ${error?.message ?? "署名URLを作れませんでした"}`);
    return { kind: "mp4", src: data.signedUrl, expiresAt: now + seconds * 1000, unprotected: false };
  }
  return { kind: video.providerRef.includes(".m3u8") ? "hls" : "mp4", src: video.providerRef, expiresAt: now + 3600_000, unprotected: true };
}

/** 動画を上げる準備（端末から直接送る先を作る。大きな動画をアプリのサーバーに通さないため） */
export async function createUploadTarget(
  fileName: string,
  folder: "videos" | "interviews" = "videos"
): Promise<{ provider: VideoProvider; uploadUrl: string; providerRef: string; method: "POST" | "PUT" }> {
  if (isCloudflareConfigured()) {
    const r = await cloudflare<{ uploadURL: string; uid: string }>("/direct_upload", {
      method: "POST",
      body: JSON.stringify({ maxDurationSeconds: 3 * 3600, requireSignedURLs: true, meta: { name: fileName.slice(0, 100), kind: folder } }),
    });
    return { provider: "cloudflare", uploadUrl: r.uploadURL, providerRef: r.uid, method: "POST" };
  }
  if (isSupabaseConfigured()) {
    const sb = supabase();
    // 非公開のバケットが無ければ作る（公開にはしない）
    const { data: bucket } = await sb.storage.getBucket(env.videoBucket);
    if (!bucket) await sb.storage.createBucket(env.videoBucket, { public: false });
    const path = `${folder}/${Date.now().toString(36)}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80)}`;
    const { data, error } = await sb.storage.from(env.videoBucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "アップロード先を作れませんでした"}`);
    return { provider: "supabase", uploadUrl: data.signedUrl, providerRef: path, method: "PUT" };
  }
  throw new Error("動画の置き場所（Cloudflare Stream か Supabase）が未設定です。デモでは動画のURLで登録してください");
}

/** 動画を消す（面接の録画の保存期間切れなど。依頼23） */
export async function deleteVideoObject(provider: VideoProvider, providerRef: string): Promise<void> {
  if (provider === "cloudflare" && isCloudflareConfigured()) {
    await fetch(`${CF_API}/accounts/${env.cloudflareAccountId}/stream/${encodeURIComponent(providerRef)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${env.cloudflareStreamToken}` },
    });
  } else if (provider === "supabase" && isSupabaseConfigured()) {
    await supabase().storage.from(env.videoBucket).remove([providerRef]);
  }
}

/** 動画の長さ（Cloudflareは処理が終わると分かる） */
export async function refreshCloudflareInfo(uid: string): Promise<{ durationSec: number; ready: boolean } | null> {
  if (!isCloudflareConfigured()) return null;
  try {
    const r = await cloudflare<{ duration: number; readyToStream: boolean }>(`/${encodeURIComponent(uid)}`);
    return { durationSec: Math.max(0, Math.round(r.duration || 0)), ready: r.readyToStream };
  } catch {
    return null;
  }
}
