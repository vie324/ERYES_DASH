"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import type { MeetingType } from "@/lib/data/types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ミーティング（1on1・全体・その他）の登録 */
export async function createMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const typeRaw = String(formData.get("meeting_type") ?? "1on1");
  const meetingType: MeetingType = typeRaw === "all" || typeRaw === "other" ? typeRaw : "1on1";
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const date = String(formData.get("meeting_date") ?? "");
  const startTimeRaw = String(formData.get("start_time") ?? "").trim();
  const hostStaffId = String(formData.get("host_staff_id") ?? "") || session.staffId;
  const guestStaffId = String(formData.get("guest_staff_id") ?? "") || null;
  const month = date.slice(0, 7);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/staff/meetings?error=input");
  if (meetingType === "1on1" && !guestStaffId) {
    redirect(`/staff/meetings?month=${month}&error=guest`);
  }

  await getDataStore().createMeeting({
    meetingType,
    title: meetingType === "1on1" ? "" : title,
    meetingDate: date,
    startTime: TIME_RE.test(startTimeRaw) ? startTimeRaw : "",
    hostStaffId,
    guestStaffId,
    createdBy: session.staffId,
  });
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=created`);
}

/** 議事録の保存（実施者・登録者・幹部・管理者のみ） */
export async function saveMeetingMinutesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const minutesUrl = String(formData.get("minutes_url") ?? "").trim().slice(0, 500);
  const minutesText = String(formData.get("minutes_text") ?? "").trim().slice(0, 5000);

  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) redirect(`/staff/meetings?month=${month}`);
  const canEdit =
    meeting!.hostStaffId === session.staffId ||
    meeting!.createdBy === session.staffId ||
    (await isExecutive(session));
  if (!canEdit) redirect(`/staff/meetings?month=${month}&error=forbidden`);

  await db.updateMeetingMinutes(id, {
    minutesUrl,
    minutesText,
    // リンクか本文のどちらかが入っていれば「提出済み」
    minutesDone: Boolean(minutesUrl || minutesText),
  });
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=minutes`);
}

/** ミーティングの削除（登録者・幹部・管理者のみ） */
export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");

  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) redirect(`/staff/meetings?month=${month}`);
  const canDelete = meeting!.createdBy === session.staffId || (await isExecutive(session));
  if (!canDelete) redirect(`/staff/meetings?month=${month}&error=forbidden`);

  await db.deleteMeeting(id);
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=deleted`);
}
