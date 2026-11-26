"use server";

// 依頼20：成長ロードマップの中身（段階・カリキュラムの項目・動画・入社日）を管理者が編集する。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { attempt, resultUrl, str, int, bool, isDate, InputError, errorMessage } from "@/lib/action-utils";
import { createUploadTarget, refreshCloudflareInfo, uploadProvider } from "@/lib/video";

const BASE = "/admin/growth";

function back(tab: string): string {
  return `${BASE}?tab=${tab}`;
}

export async function saveStageAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    const name = str(fd, "name", 80);
    if (!name) throw new InputError("段階の名前を入れてください");
    const jobType = str(fd, "jobType", 20);
    const row = {
      name,
      jobType: ["stylist", "assistant", "eyes"].includes(jobType) ? jobType : "",
      targetMonth: Math.max(0, Math.min(240, int(fd, "targetMonth"))),
      sortOrder: int(fd, "sortOrder"),
      description: str(fd, "description", 1000),
      competencies: str(fd, "competencies", 3000),
      isActive: id ? bool(fd, "isActive") : true,
    };
    if (id) await fx().growthStages.update(id, { ...row, updatedAt: new Date() });
    else await fx().growthStages.insert(row);
    return id ? "段階を保存しました" : "段階を追加しました";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("stages"), r));
}

export async function saveItemAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    const title = str(fd, "title", 100);
    const stageId = str(fd, "stageId", 64);
    if (!title) throw new InputError("項目の名前を入れてください");
    if (!(await fx().growthStages.get(stageId))) throw new InputError("段階を選んでください");
    const videoId = str(fd, "videoId", 64);
    const row = {
      stageId,
      title,
      description: str(fd, "description", 500),
      videoId: videoId || null,
      requiredPracticeMinutes: Math.max(0, Math.round(Number(str(fd, "practiceHours", 10) || 0) * 60)),
      sortOrder: int(fd, "sortOrder"),
      isActive: id ? bool(fd, "isActive") : true,
    };
    if (id) await fx().curriculumItems.update(id, { ...row, updatedAt: new Date() });
    else await fx().curriculumItems.insert(row);
    return id ? "項目を保存しました" : "項目を追加しました";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("items"), r));
}

export async function saveJoinedDatesAction(fd: FormData) {
  await requireAdmin();
  const r = await attempt(async () => {
    const f = fx();
    const staff = await getDataStore().listStaff();
    let changed = 0;
    for (const s of staff) {
      if (!fd.has(`joined_${s.id}`)) continue;
      const v = str(fd, `joined_${s.id}`, 10);
      if (v && !isDate(v)) throw new InputError(`${s.name}さんの入社日の形が正しくありません`);
      const existing = await f.staffProfiles.find({ staffId: s.id });
      if ((existing?.joinedOn ?? "") === v) continue;
      if (existing) await f.staffProfiles.update(existing.id, { joinedOn: v, updatedAt: new Date() });
      else if (v) await f.staffProfiles.insert({ staffId: s.id, joinedOn: v, note: "" });
      changed++;
    }
    return changed ? `${changed}人の入社日を保存しました` : "変わったところはありません";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("joined"), r));
}

export async function registerVideoUrlAction(fd: FormData) {
  const session = await requireAdmin();
  const r = await attempt(async () => {
    const title = str(fd, "title", 100);
    const url = str(fd, "url", 1000);
    if (!title) throw new InputError("動画の名前を入れてください");
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw new InputError("https:// から始まる動画のURLを入れてください");
    await fx().curriculumVideos.insert({
      title,
      description: str(fd, "description", 1000),
      provider: "url",
      providerRef: url,
      durationSec: Math.max(0, int(fd, "durationMin") * 60),
      status: "ready",
      isActive: true,
      createdBy: session.staffId,
    });
    return "動画を登録しました（試し用のURL）";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("videos"), r));
}

export async function saveVideoAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    const title = str(fd, "title", 100);
    if (!title) throw new InputError("動画の名前を入れてください");
    await fx().curriculumVideos.update(id, { title, description: str(fd, "description", 1000), isActive: bool(fd, "isActive"), updatedAt: new Date() });
    return "動画を保存しました";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("videos"), r));
}

/** 配信の処理が終わったか確かめる（Cloudflare Stream） */
export async function refreshVideoAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    const video = await fx().curriculumVideos.get(id);
    if (!video) throw new InputError("動画が見つかりません");
    if (video.provider !== "cloudflare") return "この動画は確かめる必要がありません";
    const info = await refreshCloudflareInfo(video.providerRef);
    if (!info) throw new InputError("Cloudflare Stream に問い合わせできませんでした");
    await fx().curriculumVideos.update(id, { status: info.ready ? "ready" : "processing", durationSec: info.durationSec || video.durationSec, updatedAt: new Date() });
    return info.ready ? "配信の準備ができました" : "まだ処理中です。少し待ってからもう一度押してください";
  });
  revalidatePath(BASE);
  redirect(resultUrl(back("videos"), r));
}

// ---------------------------------------------------------------- 端末から直接アップロードする（画面の部品から呼ぶ）

export type UploadTicket = { ok: true; id: string; uploadUrl: string; method: "POST" | "PUT"; provider: string } | { ok: false; error: string };

/** アップロードの準備（置き場所の発行と、動画の行を「処理中」で作る） */
export async function prepareVideoUploadAction(title: string, fileName: string, description: string): Promise<UploadTicket> {
  const session = await requireAdmin();
  const t = String(title ?? "").trim().slice(0, 100);
  if (!t) return { ok: false, error: "動画の名前を入れてください" };
  if (uploadProvider() === "url") return { ok: false, error: "動画の置き場所が未設定です（Cloudflare Stream の環境変数を設定してください）" };
  try {
    const target = await createUploadTarget(String(fileName ?? "video.mp4"));
    const row = await fx().curriculumVideos.insert({
      title: t,
      description: String(description ?? "").trim().slice(0, 1000),
      provider: target.provider,
      providerRef: target.providerRef,
      durationSec: 0,
      status: "processing",
      isActive: true,
      createdBy: session.staffId,
    });
    return { ok: true, id: row.id, uploadUrl: target.uploadUrl, method: target.method, provider: target.provider };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.startsWith("動画の置き場所") ? e.message : errorMessage(e) };
  }
}

/** アップロードが終わった（Supabase はすぐ再生できる。Cloudflare は処理が終わると再生できる） */
export async function finishVideoUploadAction(id: string, durationSec: number, failed: boolean): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const f = fx();
  const video = await f.curriculumVideos.get(String(id ?? ""));
  if (!video) return { ok: false, message: "動画が見つかりません" };
  if (failed) {
    await f.curriculumVideos.update(video.id, { status: "error", isActive: false, updatedAt: new Date() });
    return { ok: false, message: "アップロードに失敗しました" };
  }
  let status: "ready" | "processing" = video.provider === "supabase" ? "ready" : "processing";
  let dur = Math.max(0, Math.round(Number(durationSec) || 0));
  if (video.provider === "cloudflare") {
    const info = await refreshCloudflareInfo(video.providerRef);
    if (info?.ready) status = "ready";
    if (info?.durationSec) dur = info.durationSec;
  }
  await f.curriculumVideos.update(video.id, { status, durationSec: dur, updatedAt: new Date() });
  revalidatePath(BASE);
  return { ok: true, message: status === "ready" ? "アップロードしました" : "アップロードしました（配信の処理が終わると再生できます）" };
}
