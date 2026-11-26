// 依頼23：面接（katibito）。応募者・面接の予定・録画・評価シート・katibitoの結果。
//  ・見られる人：管理者と「採用・面接の管理」の権限の人は全員分。面接官に選ばれた人は、その応募者だけ
//  ・録画：同意のチェックが無いと上げられない。見られるのは面接官と管理者だけ。
//    選考が終わった日から保存期間（初期値6か月・管理画面で変えられる）を過ぎたら、毎日の定期実行で自動で消す
//  ・評価シート：項目は管理画面で編集。面接官が全員つけ終わるまで、ほかの人の評価は見えない（自分のものだけ）。
//    そろったら管理側に知らせ、判定を入れる
//  ・katibito：連携の仕組みが分かるまでは、結果を手で登録して表示する（TODO：katibitoの資料）

import { createHash } from "node:crypto";
import { fx } from "@/lib/data/tables";
import type { Applicant, Interview, InterviewEvaluation, InterviewRecording } from "@/lib/data/tables";
import { linesOf, readJsonSetting } from "@/lib/feature-settings";
import { staffHasPermission } from "@/lib/permissions";
import { notifyStaff, adminsOf } from "@/lib/notify";
import { deleteVideoObject } from "@/lib/video";
import { formatDateJa, todayJst } from "@/lib/date";
import type { DataStore, Staff } from "@/lib/data/types";

/** 入力の誤り（画面にそのまま出してよい文） */
export class RecruitInputError extends Error {}

export interface EvaluationItem {
  key: string;
  label: string;
  /** 何点満点（1〜10） */
  max: number;
}

export interface RecruitSettings {
  stages: string[];
  sources: string[];
  evaluationItems: EvaluationItem[];
  /** 選考が終わってから録画を消すまで（か月） */
  retentionMonths: number;
  consentText: string;
  maxInterviewers: number;
}

export const RECRUIT_SETTINGS_KEY = "recruit_settings";
export const DEFAULT_RECRUIT_SETTINGS: RecruitSettings = {
  stages: ["応募", "書類選考", "1次面接", "2次面接", "最終面接", "内定"],
  sources: ["katibito", "Indeed", "ホームページ", "Instagram", "紹介", "その他"],
  evaluationItems: [
    { key: "impression", label: "第一印象・身だしなみ", max: 5 },
    { key: "communication", label: "話し方・受け答え", max: 5 },
    { key: "values", label: "ENiの考え方との合い方", max: 5 },
    { key: "motivation", label: "意欲・成長したい気持ち", max: 5 },
    { key: "skill", label: "技術・経験", max: 5 },
  ],
  retentionMonths: 6,
  consentText: "面接の録画について、応募者ご本人から同意をいただきました（目的：選考のため。選考が終わってから保存期間を過ぎたら消します）",
  maxInterviewers: 3,
};

export async function getRecruitSettings(db: DataStore): Promise<RecruitSettings> {
  const s = await readJsonSetting(db, RECRUIT_SETTINGS_KEY, DEFAULT_RECRUIT_SETTINGS);
  const items = Array.isArray(s.evaluationItems)
    ? s.evaluationItems
        .map((i) => ({ key: String(i?.key ?? ""), label: String(i?.label ?? ""), max: Math.min(10, Math.max(1, Number(i?.max) || 5)) }))
        .filter((i) => /^[a-z0-9_]+$/.test(i.key) && i.label)
    : DEFAULT_RECRUIT_SETTINGS.evaluationItems;
  return {
    stages: Array.isArray(s.stages) && s.stages.length ? s.stages.map(String) : DEFAULT_RECRUIT_SETTINGS.stages,
    sources: Array.isArray(s.sources) && s.sources.length ? s.sources.map(String) : DEFAULT_RECRUIT_SETTINGS.sources,
    evaluationItems: items.length ? items : DEFAULT_RECRUIT_SETTINGS.evaluationItems,
    retentionMonths: Math.min(60, Math.max(1, Number(s.retentionMonths) || DEFAULT_RECRUIT_SETTINGS.retentionMonths)),
    consentText: String(s.consentText || DEFAULT_RECRUIT_SETTINGS.consentText),
    maxInterviewers: Math.min(5, Math.max(1, Number(s.maxInterviewers) || DEFAULT_RECRUIT_SETTINGS.maxInterviewers)),
  };
}

/** 「key|項目名|満点」または「項目名|満点」。key が無ければ項目名から作る（あとで項目名を直しても key は残る） */
export function parseEvaluationLines(raw: string): EvaluationItem[] {
  const out: EvaluationItem[] = [];
  for (const line of linesOf(raw, { max: 20, maxLength: 120 })) {
    const parts = line.split("|").map((p) => p.trim());
    let key = "";
    let label = "";
    let max = 5;
    if (parts.length >= 3) [key, label, max] = [parts[0], parts[1], Number(parts[2]) || 5];
    else if (parts.length === 2) [label, max] = [parts[0], Number(parts[1]) || 5];
    else label = parts[0];
    if (!label) continue;
    if (!/^[a-z0-9_]+$/.test(key)) key = `i_${createHash("sha1").update(label).digest("hex").slice(0, 6)}`;
    if (out.some((i) => i.key === key)) continue;
    out.push({ key, label: label.slice(0, 40), max: Math.min(10, Math.max(1, Math.round(max))) });
  }
  return out;
}

/** "YYYY-MM-DD" の n か月後（月末をこえる日は月末に） */
export function addMonthsToDate(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- 見られる人

export async function canManageRecruit(staff: Staff | null): Promise<boolean> {
  if (!staff || !staff.isActive) return false;
  return staff.role === "admin" || (await staffHasPermission(staff, "recruit"));
}

export async function interviewsOf(applicantId: string): Promise<Interview[]> {
  return fx().interviews.list({ where: { applicantId }, order: [["date", "asc"], ["startTime", "asc"]] });
}

export function isInterviewerOf(staffId: string, interviews: Interview[]): boolean {
  return interviews.some((i) => i.status !== "cancelled" && i.interviewerIds.includes(staffId));
}

export interface RecruitAccess {
  manage: boolean;
  interviewer: boolean;
  /** 録画を見る・上げる（面接官と管理者だけ） */
  recordings: boolean;
}

export async function accessTo(staff: Staff | null, applicant: Applicant, interviews?: Interview[]): Promise<RecruitAccess | null> {
  if (!staff || !staff.isActive) return null;
  const list = interviews ?? (await interviewsOf(applicant.id));
  const manage = await canManageRecruit(staff);
  const interviewer = isInterviewerOf(staff.id, list);
  if (!manage && !interviewer) return null;
  return { manage, interviewer, recordings: staff.role === "admin" || interviewer };
}

/** その人が見られる応募者（管理側は全員、面接官は自分が入る面接の応募者） */
export async function visibleApplicants(staff: Staff | null): Promise<Applicant[]> {
  if (!staff) return [];
  const f = fx();
  const all = await f.applicants.list({ order: [["appliedOn", "desc"], ["createdAt", "desc"]] });
  if (await canManageRecruit(staff)) return all;
  const mine = (await f.interviews.list()).filter((i) => i.status !== "cancelled" && i.interviewerIds.includes(staff.id));
  const ids = new Set(mine.map((i) => i.applicantId));
  return all.filter((a) => ids.has(a.id));
}

// ---------------------------------------------------------------- 面接の予定（面接官の予定に入る）

function eventTitle(applicant: Applicant, stage: string): string {
  return `面接：${applicant.name}さん${stage ? `（${stage}）` : ""}`;
}

async function syncPersonalEvents(interview: Interview, applicant: Applicant): Promise<void> {
  const f = fx();
  const existing = await f.personalEvents.list({ where: { sourceType: "interview", sourceId: interview.id } });
  const keep = interview.status === "cancelled" ? [] : interview.interviewerIds;
  for (const e of existing) if (!keep.includes(e.staffId)) await f.personalEvents.remove(e.id);
  for (const staffId of keep) {
    const row = {
      staffId,
      date: interview.date,
      startTime: interview.startTime,
      endTime: interview.endTime,
      title: `${eventTitle(applicant, applicant.stage)}${interview.place ? `・${interview.place}` : ""}`,
      sourceType: "interview",
      sourceId: interview.id,
    };
    const mine = existing.find((e) => e.staffId === staffId);
    if (mine) await f.personalEvents.update(mine.id, { ...row, updatedAt: new Date() });
    else await f.personalEvents.insert(row);
  }
}

export interface InterviewInput {
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  interviewerIds: string[];
}

export async function saveInterview(db: DataStore, applicant: Applicant, input: InterviewInput, by: string, interviewId?: string): Promise<Interview> {
  const f = fx();
  const settings = await getRecruitSettings(db);
  const ids = [...new Set(input.interviewerIds.filter(Boolean))];
  if (ids.length === 0) throw new RecruitInputError("面接官を1人以上選んでください");
  if (ids.length > settings.maxInterviewers) throw new RecruitInputError(`面接官は${settings.maxInterviewers}人までです`);
  const before = interviewId ? await f.interviews.get(interviewId) : null;
  const saved = before
    ? ((await f.interviews.update(before.id, { ...input, interviewerIds: ids, updatedAt: new Date() })) ?? before)
    : await f.interviews.insert({ applicantId: applicant.id, ...input, interviewerIds: ids, status: "scheduled", createdBy: by });
  await syncPersonalEvents(saved, applicant);
  const when = `${formatDateJa(input.date)} ${input.startTime}〜${input.endTime}${input.place ? `・${input.place}` : ""}`;
  const added = ids.filter((id) => !before?.interviewerIds.includes(id));
  const kept = ids.filter((id) => before?.interviewerIds.includes(id));
  const changed = before && (before.date !== input.date || before.startTime !== input.startTime || before.endTime !== input.endTime || before.place !== input.place);
  await notifyStaff(db, added.filter((id) => id !== by), {
    kind: "recruit",
    title: `面接官に選ばれました：${applicant.name}さん`,
    body: when,
    href: `/staff/recruit/${applicant.id}`,
    refId: saved.id,
  });
  if (changed) {
    await notifyStaff(db, kept.filter((id) => id !== by), { kind: "recruit", title: `面接の日時が変わりました：${applicant.name}さん`, body: when, href: `/staff/recruit/${applicant.id}`, refId: saved.id });
  }
  const removed = (before?.interviewerIds ?? []).filter((id) => !ids.includes(id));
  await notifyStaff(db, removed.filter((id) => id !== by), { kind: "recruit", title: `面接官から外れました：${applicant.name}さん`, body: when, href: "/staff/recruit", refId: saved.id, push: false });
  return saved;
}

export async function cancelInterview(db: DataStore, interview: Interview, applicant: Applicant, by: string): Promise<void> {
  const saved = (await fx().interviews.update(interview.id, { status: "cancelled", updatedAt: new Date() })) ?? interview;
  await syncPersonalEvents(saved, applicant);
  await notifyStaff(db, interview.interviewerIds.filter((id) => id !== by), {
    kind: "recruit",
    title: `面接がなくなりました：${applicant.name}さん`,
    body: `${formatDateJa(interview.date)} ${interview.startTime}〜`,
    href: "/staff/recruit",
    refId: interview.id,
  });
}

// ---------------------------------------------------------------- 選考の終わり（録画の保存期間のはじまり）

export const ENDED: Applicant["status"][] = ["hired", "rejected", "withdrawn"];

export async function setApplicantStatus(db: DataStore, applicant: Applicant, status: Applicant["status"]): Promise<void> {
  const f = fx();
  const settings = await getRecruitSettings(db);
  const ended = ENDED.includes(status);
  const endedOn = ended ? applicant.selectionEndedOn || todayJst() : "";
  await f.applicants.update(applicant.id, { status, selectionEndedOn: endedOn, updatedAt: new Date() });
  const recs = await f.interviewRecordings.list({ where: { applicantId: applicant.id, deletedAt: { isNull: true } } });
  for (const r of recs) await f.interviewRecordings.update(r.id, { deleteAfter: ended ? addMonthsToDate(endedOn, settings.retentionMonths) : "" });
}

/** 録画を消す（保存期間を過ぎたもの）。配信サービスのファイルも消す */
export async function purgeRecording(r: InterviewRecording): Promise<void> {
  if (r.provider !== "url") await deleteVideoObject(r.provider, r.providerRef).catch(() => undefined);
  await fx().interviewRecordings.update(r.id, { deletedAt: new Date(), providerRef: "" });
}

/** 毎日の定期実行：保存期間を過ぎた録画を消す */
export async function recordingPurgeJob(_db: DataStore, today: string): Promise<string> {
  const due = (await fx().interviewRecordings.list({ where: { deletedAt: { isNull: true } } })).filter((r) => r.deleteAfter && r.deleteAfter <= today);
  for (const r of due) await purgeRecording(r);
  return `${due.length}件の録画を消しました`;
}

// ---------------------------------------------------------------- 評価シート（全員がつけ終わるまで、ほかの人の評価は見えない）

export interface EvaluationState {
  interview: Interview;
  mine: InterviewEvaluation | null;
  submitted: number;
  total: number;
  allDone: boolean;
  /** 見てよい評価（そろうまでは自分のものだけ） */
  visible: InterviewEvaluation[];
}

export async function evaluationState(interview: Interview, viewerId: string): Promise<EvaluationState> {
  const rows = await fx().interviewEvaluations.list({ where: { interviewId: interview.id } });
  const done = rows.filter((r) => r.submittedAt && interview.interviewerIds.includes(r.interviewerId));
  const allDone = interview.interviewerIds.length > 0 && interview.interviewerIds.every((id) => done.some((r) => r.interviewerId === id));
  const mine = rows.find((r) => r.interviewerId === viewerId) ?? null;
  return { interview, mine, submitted: done.length, total: interview.interviewerIds.length, allDone, visible: allDone ? done : mine ? [mine] : [] };
}

export function averageScore(e: Pick<InterviewEvaluation, "scores">, items: EvaluationItem[]): number | null {
  const vals = items.map((i) => e.scores?.[i.key]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const pct = items.reduce((s, i) => s + (typeof e.scores?.[i.key] === "number" ? (e.scores[i.key] / i.max) * 100 : 0), 0) / vals.length;
  return Math.round(pct);
}

export async function submitEvaluation(
  db: DataStore,
  interview: Interview,
  applicant: Applicant,
  interviewerId: string,
  scores: Record<string, number>,
  comment: string
): Promise<{ allDone: boolean }> {
  const f = fx();
  if (!interview.interviewerIds.includes(interviewerId)) throw new RecruitInputError("この面接の面接官ではありません");
  if (interview.status === "cancelled") throw new RecruitInputError("この面接はなくなりました");
  const settings = await getRecruitSettings(db);
  const state = await evaluationState(interview, interviewerId);
  if (state.allDone) throw new RecruitInputError("全員の評価がそろったので、もう直せません");
  const clean: Record<string, number> = {};
  for (const item of settings.evaluationItems) {
    const v = Math.round(Number(scores[item.key]));
    if (!Number.isFinite(v) || v < 1 || v > item.max) throw new RecruitInputError(`「${item.label}」を1〜${item.max}で選んでください`);
    clean[item.key] = v;
  }
  const row = { scores: clean, comment: comment.slice(0, 2000), submittedAt: new Date(), updatedAt: new Date() };
  if (state.mine) await f.interviewEvaluations.update(state.mine.id, row);
  else await f.interviewEvaluations.insert({ interviewId: interview.id, applicantId: applicant.id, interviewerId, ...row });
  const after = await evaluationState(interview, interviewerId);
  if (after.allDone) {
    const staff = await db.listStaff();
    const managers: string[] = [];
    for (const s of staff) if (s.isActive && (await canManageRecruit(s))) managers.push(s.id);
    const to = [...new Set([...managers, ...interview.interviewerIds, ...(managers.length ? [] : await adminsOf(db))])];
    await notifyStaff(db, to, {
      kind: "recruit",
      title: `評価がそろいました：${applicant.name}さん`,
      body: "面接官全員の評価が見られるようになりました。判定を入れてください",
      href: `/staff/recruit/${applicant.id}`,
      refId: interview.id,
    });
  }
  return { allDone: after.allDone };
}

export const DECISION_LABEL: Record<Applicant["decision"], string> = { "": "未判定", pass: "合格", fail: "不合格", hold: "保留" };
export const STATUS_LABEL: Record<Applicant["status"], string> = { active: "選考中", hired: "採用", rejected: "不採用", withdrawn: "辞退" };
