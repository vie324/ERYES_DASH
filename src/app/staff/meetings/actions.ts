"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { findTemplate } from "@/lib/eni/meetings-templates";
import type { MeetingType } from "@/lib/data/types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ミーティングの登録（会議体テンプレート／1on1／その他） */
export async function createMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const committee = String(formData.get("committee") ?? "");
  const template = findTemplate(committee);

  const typeRaw = String(formData.get("meeting_type") ?? "1on1");
  const meetingType: MeetingType = typeRaw === "all" || typeRaw === "other" ? typeRaw : "1on1";
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const date = String(formData.get("meeting_date") ?? "");
  const startTimeRaw = String(formData.get("start_time") ?? "").trim();
  const hostStaffId = String(formData.get("host_staff_id") ?? "") || session.staffId;
  const guestStaffId = String(formData.get("guest_staff_id") ?? "") || null;
  const participants = formData.getAll("participants").map(String).filter(Boolean).slice(0, 30);
  const agenda = String(formData.get("agenda") ?? "").trim().slice(0, 2000);
  const month = date.slice(0, 7);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/staff/meetings?error=input");
  if (meetingType === "1on1" && !committee && !guestStaffId) {
    redirect(`/staff/meetings?month=${month}&error=guest`);
  }

  await getDataStore().createMeeting({
    meetingType: template ? "other" : meetingType,
    committee,
    title: template ? template.name : meetingType === "1on1" ? "" : title,
    agenda,
    meetingDate: date,
    startTime: TIME_RE.test(startTimeRaw) ? startTimeRaw : "",
    hostStaffId,
    guestStaffId: template ? null : guestStaffId,
    participants,
    createdBy: session.staffId,
  });
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=created`);
}

/** 議事録の保存（実施者・登録者・幹部・管理者のみ）。本文（Markdown）／写真 */
export async function saveMeetingMinutesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const minutesText = String(formData.get("minutes_text") ?? "").trim().slice(0, 12000);
  const photoRaw = String(formData.get("minutes_photo") ?? "");
  const minutesPhoto = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";
  const aiFlag = String(formData.get("ai_flag") ?? "") === "1";

  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) redirect(`/staff/meetings?month=${month}`);
  const canEdit =
    meeting!.hostStaffId === session.staffId ||
    meeting!.createdBy === session.staffId ||
    (await isExecutive(session));
  if (!canEdit) redirect(`/staff/meetings?month=${month}&error=forbidden`);

  await db.updateMeetingMinutes(id, {
    minutesText,
    minutesPhoto,
    minutesAi: aiFlag || meeting!.minutesAi,
    minutesDone: Boolean(minutesText || minutesPhoto),
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
