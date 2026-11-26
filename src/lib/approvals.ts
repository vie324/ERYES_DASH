// 承認のお願いの一覧（締切後の希望休・打刻の修正。依頼14で「締め日後の入力の救済」も足す）。
// 見られるのは、その人の店舗の店長（幹部）・担当店舗の店舗の管理者・管理者。

import { fx } from "@/lib/data/tables";
import { canApproveFor } from "@/lib/shift/extras";
import type { DataStore, Staff } from "@/lib/data/types";

export interface ApprovalItem {
  kind: "dayoff" | "correction" | "rescue";
  id: string;
  staffId: string;
  title: string;
  detail: string;
  createdAt: Date;
}

export async function pendingApprovals(db: DataStore, approver: Staff | null): Promise<ApprovalItem[]> {
  if (!approver) return [];
  const staff = await db.listStaff();
  const byId = new Map(staff.map((s) => [s.id, s]));
  const can = (staffId: string) => {
    const m = byId.get(staffId);
    return Boolean(m && canApproveFor(approver, m));
  };
  const f = fx();
  const [dayoffs, corrections, extra] = await Promise.all([
    f.dayoffLateRequests.list({ where: { status: "pending" }, order: [["createdAt", "asc"]] }),
    f.attendanceCorrections.list({ where: { status: "pending" }, order: [["createdAt", "asc"]] }),
    extraApprovals(db, approver, can),
  ]);
  const items: ApprovalItem[] = [
    ...dayoffs.filter((d) => can(d.staffId)).map((d) => ({
      kind: "dayoff" as const,
      id: d.id,
      staffId: d.staffId,
      title: `締切後の希望休：${d.date}${d.paidLeave ? "（有休）" : ""}`,
      detail: d.reason,
      createdAt: d.createdAt,
    })),
    ...corrections.filter((c) => can(c.staffId)).map((c) => ({
      kind: "correction" as const,
      id: c.id,
      staffId: c.staffId,
      title: `打刻の修正：${c.date} ${c.punchType === "in" ? "出勤" : "退勤"} ${c.time}`,
      detail: c.reason,
      createdAt: c.createdAt,
    })),
    ...extra,
  ];
  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** ほかの機能の承認（依頼14の救済など）。あとから足す */
async function extraApprovals(_db: DataStore, _approver: Staff, _can: (staffId: string) => boolean): Promise<ApprovalItem[]> {
  return [];
}
