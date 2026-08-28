// 会議体（定例ミーティングの型）の共通ロジック。
//  ・マスタは DB（committees テーブル）に持ち、管理者が画面から編集できる。
//  ・初回はテンプレート（meetings-templates.ts）から流し込む。
//  ・「自分が出る会議体だけ」を出すための参加者判定もここに集約する。

import { MEETING_TEMPLATES, type MeetingTemplate } from "@/lib/eni/meetings-templates";
import type { Committee, Meeting, OrgMember, Staff } from "@/lib/data/types";

/** テンプレート（初期値）を Committee の形にする */
export function committeesFromTemplates(): Omit<Committee, "id">[] {
  return MEETING_TEMPLATES.map((t, i) => ({
    committeeKey: t.key,
    name: t.name,
    purpose: t.purpose,
    cadence: t.cadence,
    durationMin: t.durationMin,
    participantsHint: t.participantsHint,
    orgTeams: t.orgTeams,
    memberStaffIds: [],
    agenda: t.agenda,
    prechecks: t.prechecks,
    sortOrder: (i + 1) * 10,
    isActive: true,
  }));
}

/** 全員参加の会議体か（しもん塾・全体ミーティングなど、チーム指定も個人指定も無いもの） */
export function isAllHands(c: Committee): boolean {
  return c.orgTeams.length === 0 && c.memberStaffIds.length === 0;
}

/**
 * その会議体の参加者（staffId）。
 * 個人指定があればそれを、無ければ組織図のチーム所属から引く。
 * どちらも無い会議体は「全員参加」とみなす。
 */
export function participantsOf(
  committee: Committee,
  orgMembers: OrgMember[],
  activeStaff: Staff[]
): string[] {
  if (committee.memberStaffIds.length > 0) {
    const active = new Set(activeStaff.map((s) => s.id));
    return committee.memberStaffIds.filter((id) => active.has(id));
  }
  if (committee.orgTeams.length > 0) {
    const active = new Set(activeStaff.map((s) => s.id));
    return [
      ...new Set(
        orgMembers
          .filter((m) => committee.orgTeams.includes(m.teamKey) && active.has(m.staffId))
          .map((m) => m.staffId)
      ),
    ];
  }
  return activeStaff.map((s) => s.id);
}

/**
 * 自分が参加する会議体か。
 * 参加者に入っている／実際に開催された回に自分が入っている（司会・相手・参加者）どちらでも「参加する」扱い。
 */
export function joinsCommittee(
  committee: Committee,
  staffId: string,
  participants: string[],
  meetings: Meeting[]
): boolean {
  if (participants.includes(staffId)) return true;
  return meetings.some(
    (m) =>
      m.committee === committee.committeeKey &&
      (m.hostStaffId === staffId || m.guestStaffId === staffId || m.participants.includes(staffId))
  );
}

/** 会議体キーの正規化（新規追加時に、名前から英数字のキーを作る） */
export function toCommitteeKey(raw: string, existing: string[]): string {
  const base =
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || `committee-${existing.length + 1}`;
  if (!existing.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!existing.includes(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/**
 * 会議体マスタ → 既存のテンプレート型。
 * ミーティングの登録フォームや議事録の見出しはテンプレート型で組んであるので、
 * DBの内容をそのまま流し込めるように変換する。
 */
export function committeeToTemplate(c: Committee): MeetingTemplate {
  return {
    key: c.committeeKey,
    name: c.name,
    purpose: c.purpose,
    cadence: c.cadence,
    durationMin: c.durationMin,
    participantsHint: c.participantsHint,
    orgTeams: c.orgTeams,
    agenda: c.agenda,
    prechecks: c.prechecks,
  };
}

/**
 * 会議体キーからテンプレートを引く。
 * まずDBのマスタ（管理者が編集した内容）を見て、無ければ初期テンプレートに落とす。
 * マスタから削除された会議体でも、過去のミーティングの見出しが「会議」に化けないようにするため。
 */
export function findCommitteeTemplate(
  committees: Committee[],
  key: string
): MeetingTemplate | undefined {
  if (!key) return undefined;
  const hit = committees.find((c) => c.committeeKey === key);
  if (hit) return committeeToTemplate(hit);
  return MEETING_TEMPLATES.find((t) => t.key === key);
}
