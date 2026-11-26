// 依頼12：打刻忘れ・打刻の修正の申請と承認。
// 本人が「何日の・出勤（退勤）を・何時に」と理由を書いて申請し、その人の店舗の店長・管理者が承認する。
// 承認された時刻でその日の打刻を数える（元の打刻は消さない。申請・承認の記録が修正の履歴になる）。

import { fx } from "@/lib/data/tables";
import type { AttendanceCorrection } from "@/lib/data/tables";
import { formatDateJa } from "@/lib/date";
import { notifyStaff } from "@/lib/notify";
import { approversOf, canApproveFor } from "@/lib/shift/extras";
import type { DataStore, Staff } from "@/lib/data/types";

export async function requestCorrection(
  db: DataStore,
  me: Staff,
  input: { date: string; punchType: "in" | "out"; time: string; reason: string }
): Promise<AttendanceCorrection> {
  const row = await fx().attendanceCorrections.insert({ staffId: me.id, ...input, status: "pending" });
  await notifyStaff(db, await approversOf(db, me), {
    kind: "approval",
    title: "打刻の修正の申請",
    body: `${me.name}さん：${formatDateJa(input.date)}の${input.punchType === "in" ? "出勤" : "退勤"}を ${input.time} に（${input.reason}）`,
    href: "/staff/approvals",
    refId: row.id,
  });
  return row;
}

export async function decideCorrection(
  db: DataStore,
  approver: Staff,
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: boolean; message: string }> {
  const f = fx();
  const row = await f.attendanceCorrections.get(id);
  if (!row || row.status !== "pending") return { ok: false, message: "申請が見つからないか、もう決まっています" };
  const member = await db.getStaff(row.staffId);
  if (!member || !canApproveFor(approver, member)) return { ok: false, message: "この申請を決められるのは、その人の店舗の店長・管理者です" };
  await f.attendanceCorrections.update(id, { status: decision, decidedBy: approver.id, decidedAt: new Date(), decisionNote: note });
  await notifyStaff(db, [member.id], {
    kind: "shift",
    title: decision === "approved" ? "打刻の修正が承認されました" : "打刻の修正は見送りになりました",
    body: `${formatDateJa(row.date)}の${row.punchType === "in" ? "出勤" : "退勤"} ${row.time}${note ? `：${note}` : ""}`,
    href: "/staff/attendance",
    refId: id,
  });
  return { ok: true, message: decision === "approved" ? "承認しました" : "見送りにしました" };
}
