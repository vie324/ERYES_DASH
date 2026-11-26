"use server";

// 依頼23：面接（応募者・面接の予定・評価・判定・録画・katibito）。どの操作も、ここで権限を確かめる。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import type { Applicant } from "@/lib/data/tables";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { attempt, resultUrl, str, int, isDate, isTime, bool, InputError, errorMessage } from "@/lib/action-utils";
import {
  accessTo,
  addMonthsToDate,
  cancelInterview,
  canManageRecruit,
  ENDED,
  evaluationState,
  getRecruitSettings,
  interviewsOf,
  purgeRecording,
  RecruitInputError,
  saveInterview,
  setApplicantStatus,
  submitEvaluation,
} from "@/lib/recruit";
import { createUploadTarget, uploadProvider } from "@/lib/video";

const LIST = "/staff/recruit";
const detail = (id: string) => `/staff/recruit/${id}`;

async function loadFor(v: Viewer, applicantId: string) {
  const applicant = await fx().applicants.get(applicantId);
  if (!applicant) throw new InputError("応募者が見つかりません");
  const interviews = await interviewsOf(applicant.id);
  const access = await accessTo(v.me, applicant, interviews);
  if (!access) throw new InputError("この応募者は見られません");
  return { applicant, interviews, access };
}

async function requireManager(v: Viewer) {
  if (!(await canManageRecruit(v.me))) throw new InputError("採用・面接の管理の権限が必要です");
}

function applicantFields(fd: FormData) {
  const name = str(fd, "name", 60);
  const appliedOn = str(fd, "appliedOn", 10);
  if (!name) throw new InputError("名前を入れてください");
  if (appliedOn && !isDate(appliedOn)) throw new InputError("応募日の形が正しくありません");
  return {
    name,
    appliedOn,
    source: str(fd, "source", 40),
    stage: str(fd, "stage", 40),
    storeId: str(fd, "storeId", 64) || null,
    note: str(fd, "note", 2000),
  };
}

export async function createApplicantAction(fd: FormData) {
  const v = await requireViewer();
  let id = "";
  const r = await attempt(async () => {
    await requireManager(v);
    const row = await fx().applicants.insert({ ...applicantFields(fd), status: "active", decision: "", createdBy: v.staffId });
    id = row.id;
    return "応募者を登録しました";
  });
  revalidatePath(LIST);
  redirect(resultUrl(r.ok && id ? detail(id) : LIST, r));
}

export async function updateApplicantAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    await requireManager(v);
    const { applicant } = await loadFor(v, id);
    await fx().applicants.update(applicant.id, { ...applicantFields(fd), updatedAt: new Date() });
    return "保存しました";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function setStatusAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "id", 64);
  const status = str(fd, "status", 20) as Applicant["status"];
  const r = await attempt(async () => {
    await requireManager(v);
    if (!["active", "hired", "rejected", "withdrawn"].includes(status)) throw new InputError("状態を選んでください");
    const { applicant } = await loadFor(v, id);
    await setApplicantStatus(getDataStore(), applicant, status);
    return ENDED.includes(status) ? "選考を終えました（録画は保存期間を過ぎたら自動で消えます）" : "選考中に戻しました";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function saveInterviewAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    await requireManager(v);
    const { applicant } = await loadFor(v, id);
    const date = str(fd, "date", 10);
    const startTime = str(fd, "startTime", 5);
    const endTime = str(fd, "endTime", 5);
    if (!isDate(date) || !isTime(startTime) || !isTime(endTime) || endTime <= startTime) throw new InputError("日にちと時間（終わりは始まりより後）を入れてください");
    const staff = await getDataStore().listStaff();
    const interviewerIds = fd.getAll("interviewers").map(String).filter((x) => staff.some((s) => s.id === x && s.isActive));
    try {
      await saveInterview(getDataStore(), applicant, { date, startTime, endTime, place: str(fd, "place", 80), interviewerIds }, v.staffId, str(fd, "interviewId", 64) || undefined);
    } catch (e) {
      if (e instanceof RecruitInputError) throw new InputError(e.message);
      throw e;
    }
    return "面接の予定を保存しました（面接官の予定に入り、お知らせが届きます）";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function cancelInterviewAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    await requireManager(v);
    const { applicant, interviews } = await loadFor(v, id);
    const interview = interviews.find((i) => i.id === str(fd, "interviewId", 64));
    if (!interview) throw new InputError("面接が見つかりません");
    await cancelInterview(getDataStore(), interview, applicant, v.staffId);
    return "面接を取り消しました（面接官の予定からも消えました）";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function submitEvaluationAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    const { applicant, interviews } = await loadFor(v, id);
    const interview = interviews.find((i) => i.id === str(fd, "interviewId", 64));
    if (!interview) throw new InputError("面接が見つかりません");
    const settings = await getRecruitSettings(getDataStore());
    const scores = Object.fromEntries(settings.evaluationItems.map((i) => [i.key, int(fd, `score_${i.key}`, 0)]));
    try {
      const { allDone } = await submitEvaluation(getDataStore(), interview, applicant, v.staffId, scores, str(fd, "comment", 2000));
      return allDone ? "評価を出しました。全員の評価がそろったので、ほかの面接官の評価も見られます" : "評価を出しました（全員がそろうまで、ほかの人の評価は見えません）";
    } catch (e) {
      if (e instanceof RecruitInputError) throw new InputError(e.message);
      throw e;
    }
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function decideAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "id", 64);
  const r = await attempt(async () => {
    await requireManager(v);
    const { applicant, interviews } = await loadFor(v, id);
    const decision = str(fd, "decision", 10) as Applicant["decision"];
    if (!["pass", "fail", "hold", ""].includes(decision)) throw new InputError("判定を選んでください");
    const live = interviews.filter((i) => i.status !== "cancelled");
    if (decision && live.length > 0) {
      const states = await Promise.all(live.map((i) => evaluationState(i, v.staffId)));
      if (!states.some((s) => s.allDone)) throw new InputError("面接官全員の評価がそろってから判定してください");
    }
    await fx().applicants.update(applicant.id, { decision, decisionNote: str(fd, "decisionNote", 1000), decidedBy: decision ? v.staffId : null, decidedAt: decision ? new Date() : null, updatedAt: new Date() });
    return "判定を保存しました";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function addKatibitoAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    await requireManager(v);
    const { applicant } = await loadFor(v, id);
    const url = str(fd, "attachment", 1000);
    if (url && !/^https:\/\//i.test(url)) throw new InputError("リンクは https:// から始まるURLにしてください");
    const score = Number(str(fd, "score", 10));
    await fx().katibitoResults.insert({
      applicantId: applicant.id,
      interviewId: str(fd, "interviewId", 64) || null,
      score: Number.isFinite(score) ? score : 0,
      summary: str(fd, "summary", 2000),
      details: {},
      attachment: url,
      fileName: "",
      createdBy: v.staffId,
    });
    return "katibitoの結果を登録しました";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

// ---------------------------------------------------------------- 録画（同意のチェックが必須。面接官と管理者だけ）

async function recordingDeleteAfter(applicant: Applicant): Promise<string> {
  if (!applicant.selectionEndedOn) return "";
  const settings = await getRecruitSettings(getDataStore());
  return addMonthsToDate(applicant.selectionEndedOn, settings.retentionMonths);
}

/** 試し用（デモ・置き場所が未設定のとき）：動画のURLで録画を登録する */
export async function registerRecordingUrlAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    const { applicant, access } = await loadFor(v, id);
    if (!access.recordings) throw new InputError("録画を扱えるのは面接官と管理者だけです");
    if (!bool(fd, "consent")) throw new InputError("応募者の同意のチェックを入れてください");
    const url = str(fd, "url", 1000);
    if (!/^https:\/\/\S+$/i.test(url)) throw new InputError("https:// から始まる動画のURLを入れてください");
    await fx().interviewRecordings.insert({
      applicantId: applicant.id,
      interviewId: str(fd, "interviewId", 64) || null,
      provider: "url",
      providerRef: url,
      fileName: url.split("/").pop()?.slice(0, 100) ?? "",
      consentChecked: true,
      consentNote: str(fd, "consentNote", 300),
      deleteAfter: await recordingDeleteAfter(applicant),
      uploadedBy: v.staffId,
    });
    return "録画を登録しました（試し用のURL）";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}

export async function prepareRecordingUploadAction(
  applicantId: string,
  interviewId: string,
  fileName: string,
  consent: boolean,
  consentNote: string
): Promise<{ ok: true; id: string; uploadUrl: string; method: "POST" | "PUT"; provider: string } | { ok: false; error: string }> {
  const v = await requireViewer();
  try {
    const { applicant, access } = await loadFor(v, String(applicantId ?? ""));
    if (!access.recordings) return { ok: false, error: "録画を扱えるのは面接官と管理者だけです" };
    if (consent !== true) return { ok: false, error: "応募者の同意のチェックを入れてください" };
    if (uploadProvider() === "url") return { ok: false, error: "録画の置き場所が未設定です（Cloudflare Stream か Supabase の設定が要ります）" };
    const target = await createUploadTarget(String(fileName ?? "interview.mp4"), "interviews");
    const row = await fx().interviewRecordings.insert({
      applicantId: applicant.id,
      interviewId: String(interviewId ?? "") || null,
      provider: target.provider,
      providerRef: target.providerRef,
      fileName: String(fileName ?? "").slice(0, 100),
      consentChecked: true,
      consentNote: String(consentNote ?? "").slice(0, 300),
      deleteAfter: await recordingDeleteAfter(applicant),
      uploadedBy: v.staffId,
    });
    return { ok: true, id: row.id, uploadUrl: target.uploadUrl, method: target.method, provider: target.provider };
  } catch (e) {
    return { ok: false, error: e instanceof InputError ? e.message : errorMessage(e) };
  }
}

export async function finishRecordingUploadAction(id: string, failed: boolean): Promise<{ ok: boolean; message: string }> {
  const v = await requireViewer();
  const rec = await fx().interviewRecordings.get(String(id ?? ""));
  if (!rec || rec.uploadedBy !== v.staffId) return { ok: false, message: "録画が見つかりません" };
  if (failed) {
    await purgeRecording(rec);
    return { ok: false, message: "アップロードに失敗しました" };
  }
  revalidatePath(detail(rec.applicantId));
  return { ok: true, message: "録画を上げました" };
}

export async function deleteRecordingAction(fd: FormData) {
  const v = await requireViewer();
  const id = str(fd, "applicantId", 64);
  const r = await attempt(async () => {
    const { access } = await loadFor(v, id);
    const rec = await fx().interviewRecordings.get(str(fd, "recordingId", 64));
    if (!rec || rec.applicantId !== id) throw new InputError("録画が見つかりません");
    if (!access.recordings || (v.session.role !== "admin" && rec.uploadedBy !== v.staffId)) throw new InputError("消せるのは、上げた人と管理者だけです");
    await purgeRecording(rec);
    return "録画を消しました";
  });
  revalidatePath(detail(id));
  redirect(resultUrl(detail(id), r));
}
