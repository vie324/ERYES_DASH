/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { Markdown } from "@/lib/markdown";
import { findCommitteeTemplate } from "@/lib/eni/committees";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { Icon } from "@/components/icons";
import { getChatOverview } from "@/lib/chat";
import { forwardMinutesAction } from "@/app/staff/chat/actions";

// 議事録の清書ページ（PDF出力用）。ブラウザの「印刷 → PDFで保存」でそのままPDFになる。
// ?print=1 で開くと、自動で印刷ダイアログを出す。
export default async function MinutesPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) notFound();

  const [staffList, tasks, chatOverview, committees] = await Promise.all([
    db.listStaff(),
    db.listMeetingTasks([id]),
    // 議事録の転送先（自分が入っているトークルーム）
    getChatOverview(db, session.staffId),
    db.listCommittees(),
  ]);
  const nameOf = (sid: string | null) => (sid ? (staffList.find((s) => s.id === sid)?.name ?? "") : "");
  const template = findCommitteeTemplate(committees, meeting!.committee);
  const meetingName = template?.name || meeting!.title || (meeting!.meetingType === "1on1" ? "1on1ミーティング" : "ミーティング");
  const participantNames = [
    ...(meeting!.guestStaffId ? [meeting!.guestStaffId] : []),
    ...meeting!.participants,
    meeting!.hostStaffId,
  ]
    .map(nameOf)
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  const month = meeting!.meetingDate.slice(0, 7);

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="議事録" backHref={`/staff/meetings?month=${month}`} backLabel="ミーティングへ戻る" />
      </div>

      {/* 清書（A4想定） */}
      <article className="bg-white rounded-2xl border border-ink-200 p-6 print:border-0 print:p-0">
        <header className="border-b-2 border-brand-300 pb-3 mb-4">
          <h1 className="font-display text-2xl font-bold text-ink-900">{meetingName} 議事録</h1>
          <div className="mt-2 text-sm text-ink-600 space-y-0.5">
            <p>日付：{formatDateJa(meeting!.meetingDate, true)}{meeting!.startTime && ` ${meeting!.startTime}〜`}</p>
            {participantNames.length > 0 && <p>参加者：{participantNames.join("、")}</p>}
          </div>
        </header>

        {meeting!.minutesText ? (
          <Markdown text={meeting!.minutesText} />
        ) : (
          <p className="text-sm text-ink-400">議事録はまだ作成されていません。</p>
        )}

        {/* タスク一覧（誰が・何を・いつまでに） */}
        {tasks.length > 0 && (
          <section className="mt-5">
            <p className="font-display text-base font-bold text-ink-900 mb-1.5">タスク一覧</p>
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>タスク</th>
                    <th>担当</th>
                    <th>期限</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-normal">{t.title}</td>
                      <td>{t.assigneeName || "未定"}</td>
                      <td>{t.dueDate ? formatDateJa(t.dueDate) : "未定"}</td>
                      <td>{t.done ? "完了" : "未完了"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {meeting!.minutesPhoto && (
          <img
            src={meeting!.minutesPhoto}
            alt="議事録の写真"
            className="w-full max-h-96 object-contain rounded-lg border border-ink-200 mt-4"
          />
        )}

        {meeting!.minutesAi && (
          <p className="text-[10px] text-ink-300 mt-6 print:mt-10">AI整形（要確認）／ ENi 議事録</p>
        )}
      </article>

      {/* トークルームへ転送（本文をそのまま送り、ノートにも残す） */}
      {meeting!.minutesText && chatOverview.rooms.length > 0 && (
        <form
          action={forwardMinutesAction}
          className="card mt-4 print:hidden flex flex-col sm:flex-row sm:items-end gap-2"
        >
          <input type="hidden" name="meeting_id" value={meeting!.id} />
          <input type="hidden" name="back" value={`/staff/meetings/${meeting!.id}`} />
          <div className="flex-1">
            <label className="label !text-xs" htmlFor="forward-room">
              この議事録をトークルームへ転送する
            </label>
            <select id="forward-room" name="room_id" className="input !min-h-11 !py-2 text-sm" required>
              {chatOverview.rooms.map((r) => (
                <option key={r.room.id} value={r.room.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary !min-h-11 !py-2 !px-4 text-sm shrink-0">
            <Icon name="send" className="w-4 h-4" />
            転送する
          </button>
        </form>
      )}

      <div className="mt-4 print:hidden">
        <PrintButton auto={query.print === "1"} />
        <p className="text-xs text-ink-400 mt-2 text-center">
          印刷ダイアログで「PDFで保存」を選ぶとPDFになります（スマホは共有→プリント）。
        </p>
      </div>
    </div>
  );
}
