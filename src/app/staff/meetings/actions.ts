"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { findCommitteeTemplate } from "@/lib/eni/committees";
import type { MeetingType } from "@/lib/data/types";
import { notifyQuietly, pushPreview } from "@/lib/push/notify";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// 添付PDFの data URL の長さ上限（4MB のファイルを base64 にすると約 5.4MB）
const MINUTES_FILE_MAX_LENGTH = 5_600_000;

/** ミーティングの登録（会議体テンプレート／1on1／その他） */
export async function createMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const committee = String(formData.get("committee") ?? "");
  const template = findCommitteeTemplate(await getDataStore().listCommittees(), committee);

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

/** 議事録の保存（実施者・登録者・幹部・管理者のみ）。本文（Markdown）／タスク／写真／添付ファイル */
export async function saveMeetingMinutesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const month = String(formData.get("month") ?? "");
  const minutesText = String(formData.get("minutes_text") ?? "").trim().slice(0, 12000);
  const photoRaw = String(formData.get("minutes_photo") ?? "");
  const minutesPhoto = photoRaw.startsWith("data:image/") ? photoRaw.slice(0, 2_500_000) : "";
  // 添付ファイルはPDFのみ（トークルームの添付と同じ上限）
  const fileRaw = String(formData.get("minutes_file") ?? "");
  const minutesFile =
    /^data:application\/pdf;base64,/.test(fileRaw) && fileRaw.length <= MINUTES_FILE_MAX_LENGTH ? fileRaw : "";
  const minutesFileName = minutesFile
    ? String(formData.get("minutes_file_name") ?? "").trim().slice(0, 120) || "資料.pdf"
    : "";
  const aiFlag = String(formData.get("ai_flag") ?? "") === "1";

  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) redirect(`/staff/meetings?month=${month}`);
  const canEdit =
    meeting!.hostStaffId === session.staffId ||
    meeting!.createdBy === session.staffId ||
    (await isExecutive(session));
  if (!canEdit) redirect(`/staff/meetings?month=${month}&error=forbidden`);

  // タスク（誰が・何を・いつまでに）。担当は名前で入ってくるのでスタッフに紐付ける
  const staffList = await db.listStaff();
  const tasks = parseTasks(String(formData.get("tasks") ?? "[]")).map((t) => {
    const matched = staffList.find((s) => s.name === t.assignee || s.name.replace(/\s+/g, "") === t.assignee.replace(/\s+/g, ""));
    return {
      title: t.title,
      assigneeStaffId: matched?.id ?? null,
      assigneeName: matched?.name ?? t.assignee,
      dueDate: t.due,
      done: false,
    };
  });

  // 今回の保存で新しく担当になった人にだけ通知する（保存し直すたびに鳴らさない）
  const before = await db.listMeetingTasks([id]);
  const newlyAssigned = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.assigneeStaffId || t.assigneeStaffId === session.staffId) continue;
    if (before.some((b) => b.assigneeStaffId === t.assigneeStaffId && b.title === t.title)) continue;
    newlyAssigned.set(t.assigneeStaffId, [...(newlyAssigned.get(t.assigneeStaffId) ?? []), t.title]);
  }

  await db.updateMeetingMinutes(id, {
    minutesText,
    minutesPhoto,
    minutesFile,
    minutesFileName,
    minutesAi: aiFlag || meeting!.minutesAi,
    minutesDone: Boolean(minutesText || minutesPhoto || minutesFile),
  });
  await db.replaceMeetingTasks(id, tasks);
  await Promise.all(
    [...newlyAssigned].map(([staffId, titles]) =>
      notifyQuietly(db, [staffId], {
        title: "議事録のタスクが割り当てられました",
        body: pushPreview(titles.join("／")),
        url: "/staff/tasks",
        tag: "meeting-task",
      })
    )
  );
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=minutes`);
}

/** 議事録タスクの完了チェック（会議の関係者・幹部・管理者、または担当者本人） */
export async function toggleMeetingTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const taskId = String(formData.get("task_id") ?? "");
  const meetingId = String(formData.get("meeting_id") ?? "");
  const month = String(formData.get("month") ?? "");
  const done = String(formData.get("done") ?? "") === "1";

  const db = getDataStore();
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) redirect(`/staff/meetings?month=${month}`);
  const task = (await db.listMeetingTasks([meetingId])).find((t) => t.id === taskId);
  if (!task) redirect(`/staff/meetings?month=${month}`);

  const canToggle =
    task!.assigneeStaffId === session.staffId ||
    meeting!.hostStaffId === session.staffId ||
    meeting!.createdBy === session.staffId ||
    meeting!.participants.includes(session.staffId) ||
    (await isExecutive(session));
  if (!canToggle) redirect(`/staff/meetings?month=${month}&error=forbidden`);

  await db.setMeetingTaskDone(taskId, done);
  revalidatePath("/staff/meetings");
  redirect(`/staff/meetings?month=${month}&saved=task#m-${meetingId}`);
}

function parseTasks(raw: string): { title: string; assignee: string; due: string }[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => {
        const due = String(t?.due ?? "").trim();
        return {
          title: String(t?.title ?? "").trim().slice(0, 200),
          assignee: String(t?.assignee ?? "").trim().slice(0, 40),
          due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
        };
      })
      .filter((t) => t.title)
      .slice(0, 30);
  } catch {
    return [];
  }
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
