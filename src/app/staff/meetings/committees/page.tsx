import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { MEETING_TEMPLATES } from "@/lib/eni/meetings-templates";
import { MonthNav, PageHeader, StatusBadge } from "@/components/ui";

// 会議体の整理：どんな会議体があって、誰が出て、何を話すのかを一枚で見る。
// 今月やったか（議事録が出ているか）もここで分かる。
export default async function CommitteesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();

  const db = getDataStore();
  const [meetings, staffList, orgMembers, orgUnits] = await Promise.all([
    db.listMeetings({ from, to }),
    db.listStaff(),
    db.listOrgMembers(),
    db.listOrgUnits(),
  ]);
  // 組織図の部署名（担当チームの表示に使う）
  const unitNameOf = (key: string) => orgUnits.find((u) => u.unitKey === key)?.name ?? key;
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  const heldOf = (key: string) => meetings.filter((m) => m.committee === key);
  const membersOfTeams = (teamKeys: string[]) => {
    const ids = orgMembers
      .filter((m) => teamKeys.includes(m.teamKey) && staffMap.get(m.staffId)?.isActive)
      .map((m) => m.staffId);
    return [...new Set(ids)];
  };

  return (
    <div>
      <PageHeader title="会議体の一覧" backHref="/staff/meetings" backLabel="ミーティングへ戻る" />

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/meetings/committees?month=${addMonths(month, -1)}`}
        nextHref={`/staff/meetings/committees?month=${addMonths(month, 1)}`}
      />

      <div className="space-y-3">
        {MEETING_TEMPLATES.map((t) => {
          const held = heldOf(t.key);
          const done = held.filter((m) => m.minutesDone);
          const teamMemberIds = membersOfTeams(t.orgTeams);
          const status = done.length > 0 ? "done" : held.length > 0 ? "planned" : "none";

          return (
            <section key={t.key} className="card">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold">{t.name}</h2>
                  <p className="text-[11px] text-ink-500">{t.cadence}</p>
                </div>
                {status === "done" ? (
                  <StatusBadge label="今月 実施済み" tone="ok" />
                ) : status === "planned" ? (
                  <StatusBadge label="今月 予定あり" tone="pending" />
                ) : (
                  <StatusBadge label="今月 未実施" tone="warning" />
                )}
              </div>

              <p className="text-sm text-ink-700 mt-2">{t.purpose}</p>

              {/* 参加メンバー：組織図のチームに登録があればその実名、無ければ目安を出す */}
              <div className="mt-2">
                <p className="text-xs font-bold text-brand-700">参加メンバー</p>
                {teamMemberIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {teamMemberIds.map((id) => (
                      <span key={id} className="text-xs font-bold rounded-full px-3 py-1 border border-ink-300 text-ink-600">
                        {staffMap.get(id)?.name ?? "？"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500 mt-0.5">目安：{t.participantsHint}</p>
                )}
                {t.orgTeams.length > 0 && (
                  <p className="text-[11px] text-ink-400 mt-1">
                    担当チーム：{t.orgTeams.map(unitNameOf).join("、")}
                  </p>
                )}
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-bold text-brand-700">アジェンダ・事前チェックを見る</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-ink-500">アジェンダ</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-700">{t.agenda}</p>
                  </div>
                  {t.prechecks.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-bold text-amber-800 mb-1">会議前にシステムで確認</p>
                      <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                        {t.prechecks.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </details>

              {held.length > 0 && (
                <p className="text-[11px] text-ink-500 mt-2">
                  今月の開催：
                  {held.map((m) => `${formatDateJa(m.meetingDate)}${m.minutesDone ? "（議事録あり）" : m.meetingDate <= today ? "（議事録なし）" : "（予定）"}`).join("、")}
                </p>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs text-ink-400">
          ※ 参加メンバーは組織図（シナジーマップ）のチーム登録から自動で出ます。未登録の会議体は「目安」の名前を表示します。
        </p>
        <p className="text-center">
          <Link href="/staff/org" className="text-sm font-bold text-brand-700 underline">
            組織図（シナジーマップ）でチームを設定する
          </Link>
        </p>
      </div>
    </div>
  );
}
