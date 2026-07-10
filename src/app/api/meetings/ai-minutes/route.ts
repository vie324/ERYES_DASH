// 議事録のAI整形：生メモ → 整形済み議事録（Markdown）を返す（保存はしない）。
// Anthropic APIキー未設定時はテンプレ整形にフォールバック（デモでも動く）。

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { generateMinutes } from "@/lib/anthropic";
import { findTemplate } from "@/lib/eni/meetings-templates";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "未ログインです" }, { status: 401 });

  let body: { meetingId?: unknown; rawNotes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  const rawNotes = typeof body.rawNotes === "string" ? body.rawNotes.slice(0, 12000) : "";
  if (!meetingId || !rawNotes.trim()) {
    return NextResponse.json({ ok: false, error: "メモを入力してください" }, { status: 400 });
  }

  const db = getDataStore();
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) return NextResponse.json({ ok: false, error: "会議が見つかりません" }, { status: 404 });

  const me = await db.getStaff(session.staffId);
  const canEdit =
    meeting.hostStaffId === session.staffId ||
    meeting.createdBy === session.staffId ||
    session.role === "admin" ||
    (me?.isExecutive ?? false);
  if (!canEdit) return NextResponse.json({ ok: false, error: "権限がありません" }, { status: 403 });

  const staffList = await db.listStaff();
  const nameOf = (id: string | null) => (id ? (staffList.find((s) => s.id === id)?.name ?? "") : "");
  const participantNames = [
    ...(meeting.guestStaffId ? [meeting.guestStaffId] : []),
    ...meeting.participants,
    meeting.hostStaffId,
  ]
    .map(nameOf)
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  const template = findTemplate(meeting.committee);
  const meetingName = template?.name || meeting.title || (meeting.meetingType === "1on1" ? "1on1" : "ミーティング");

  const { markdown, ai } = await generateMinutes({
    meetingName,
    dateLabel: formatDateJa(meeting.meetingDate, true),
    participants: participantNames.join("、"),
    agenda: meeting.agenda,
    rawNotes,
  });

  return NextResponse.json({ ok: true, markdown, ai });
}
