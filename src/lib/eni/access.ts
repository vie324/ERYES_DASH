// ENi機能の権限ヘルパー：幹部（is_executive）・管理者の判定と、ミーティング／議事録の権限

import { getDataStore } from "@/lib/data";
import type { Session } from "@/lib/auth/session";
import { findCommitteeTemplate, isAllHands } from "@/lib/eni/committees";
import type { Committee, Meeting } from "@/lib/data/types";

export async function isExecutive(session: Session): Promise<boolean> {
  if (session.role === "admin") return true;
  const me = await getDataStore().getStaff(session.staffId);
  return me?.isExecutive ?? false;
}

/** 練習時間（分）の表示："90 → 1h30" "60 → 1h" "30 → 30m" */
export function formatPracticeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// ── ミーティング・議事録の権限 ───────────────────────────────────────────
// 議事録は人事評価や1on1の中身まで書かれるため、見える範囲・直せる範囲を分けている。
//  ・閲覧（本文・写真・添付・タスク）…… その会議の関係者／全体ミーティング／幹部・管理者
//  ・編集 …………………………………………… その会議の関係者だけ（幹部でも出ていない会議は直せない）
// カレンダーや一覧の「いつ・誰が・何の会議か」は、予定がかぶらないように全員に見せる。

/** その会議の関係者か（実施者・1on1の相手・参加者・登録者） */
export function isMeetingMember(meeting: Meeting, staffId: string): boolean {
  return (
    meeting.hostStaffId === staffId ||
    meeting.guestStaffId === staffId ||
    meeting.participants.includes(staffId) ||
    meeting.createdBy === staffId
  );
}

/**
 * 全員で見るミーティングか。
 * 全体ミーティングと、参加者を絞っていない会議体（しもん塾など）は、
 * 出ていない人も議事録を読めるようにする（共有が目的の会でそもそも非公開にする意味がないため）。
 */
export function isAllHandsMeeting(meeting: Meeting, committees: Committee[]): boolean {
  if (meeting.meetingType === "all") return true;
  if (!meeting.committee) return false;
  const master = committees.find((c) => c.committeeKey === meeting.committee);
  if (master) return isAllHands(master);
  // マスタから消された会議体は初期テンプレートに落とす（見出しの解決と同じ扱い）
  const template = findCommitteeTemplate(committees, meeting.committee);
  return template ? template.orgTeams.length === 0 : false;
}

/** 議事録の中身（本文・写真・添付・タスク）を見られるか */
export function canViewMinutes(
  meeting: Meeting,
  staffId: string,
  opts: { isExec: boolean; committees: Committee[] }
): boolean {
  return (
    opts.isExec || isMeetingMember(meeting, staffId) || isAllHandsMeeting(meeting, opts.committees)
  );
}

/** 議事録を書き換えられるか（幹部・管理者でも、参加していない会議は編集できない） */
export function canEditMinutes(meeting: Meeting, staffId: string): boolean {
  return isMeetingMember(meeting, staffId);
}
