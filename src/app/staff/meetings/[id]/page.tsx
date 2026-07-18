/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { Markdown } from "@/lib/markdown";
import { findTemplate } from "@/lib/eni/meetings-templates";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

// 議事録の清書ページ（PDF出力用）。ブラウザの「印刷 → PDFで保存」でそのままPDFになる。
export default async function MinutesPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const db = getDataStore();
  const meeting = await db.getMeeting(id);
  if (!meeting) notFound();

  const staffList = await db.listStaff();
  const nameOf = (sid: string | null) => (sid ? (staffList.find((s) => s.id === sid)?.name ?? "") : "");
  const template = findTemplate(meeting!.committee);
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
      <article className="bg-white rounded-2xl border border-stone-200 p-6 print:border-0 print:p-0">
        <header className="border-b-2 border-brand-300 pb-3 mb-4">
          <h1 className="font-display text-2xl font-bold text-ink-900">{meetingName} 議事録</h1>
          <div className="mt-2 text-sm text-stone-600 space-y-0.5">
            <p>日付：{formatDateJa(meeting!.meetingDate, true)}{meeting!.startTime && ` ${meeting!.startTime}〜`}</p>
            {participantNames.length > 0 && <p>参加者：{participantNames.join("、")}</p>}
          </div>
        </header>

        {meeting!.minutesText ? (
          <Markdown text={meeting!.minutesText} />
        ) : (
          <p className="text-sm text-stone-400">議事録はまだ作成されていません。</p>
        )}

        {meeting!.minutesPhoto && (
          <img
            src={meeting!.minutesPhoto}
            alt="議事録の写真"
            className="w-full max-h-96 object-contain rounded-lg border border-stone-200 mt-4"
          />
        )}

        {meeting!.minutesAi && (
          <p className="text-[10px] text-stone-300 mt-6 print:mt-10">AI整形（要確認）／ ENi 議事録</p>
        )}
      </article>

      <div className="mt-4 print:hidden">
        <PrintButton />
        <p className="text-xs text-stone-400 mt-2 text-center">
          印刷ダイアログで「PDFで保存」を選ぶとPDFになります（スマホは共有→プリント）。
        </p>
      </div>
    </div>
  );
}
