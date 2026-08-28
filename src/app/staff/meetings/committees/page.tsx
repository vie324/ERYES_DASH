import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { isAllHands, joinsCommittee, participantsOf } from "@/lib/eni/committees";
import { MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MemberPicker } from "@/app/staff/chat/chat-client";
import type { Committee } from "@/lib/data/types";
import { deleteCommitteeAction, saveCommitteeAction } from "./actions";

// 会議体の整理：どんな会議体があって、誰が出て、何を話すのかを一枚で見る。
// 既定では「自分が参加する会議体」だけを出し、全部を見たいときは切り替えられる。
// 内容（名前・目的・アジェンダ・参加者など）は管理者アカウントがこの画面から編集できる。
export default async function CommitteesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; all?: string; saved?: string; error?: string; edit?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();
  const isAdmin = session.role === "admin";
  const showAll = params.all === "1";

  const db = getDataStore();
  const [committees, meetings, staffList, orgMembers, orgUnits] = await Promise.all([
    db.listCommittees(),
    db.listMeetings({ from, to }),
    db.listStaff(),
    db.listOrgMembers(),
    db.listOrgUnits(),
  ]);
  const activeStaff = staffList.filter((s) => s.isActive);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const unitNameOf = (key: string) => orgUnits.find((u) => u.unitKey === key)?.name ?? key;

  // 会議体ごとに「参加者」と「自分が出るか」を先に出しておく
  const rows = committees
    .filter((c) => c.isActive || isAdmin)
    .map((c) => {
      const participants = participantsOf(c, orgMembers, activeStaff);
      return {
        committee: c,
        participants,
        mine: joinsCommittee(c, session.staffId, participants, meetings),
        held: meetings.filter((m) => m.committee === c.committeeKey),
      };
    });
  const mineCount = rows.filter((r) => r.mine).length;
  const shown = showAll ? rows : rows.filter((r) => r.mine);

  const notice =
    params.saved === "deleted"
      ? "会議体を削除しました"
      : params.saved
        ? "会議体を保存しました"
        : "";
  const errorMsg =
    params.error === "forbidden"
      ? "会議体を編集できるのは管理者アカウントだけです"
      : params.error === "confirm"
        ? "削除するには確認チェックを入れてください"
        : params.error
          ? "入力内容を確認してください"
          : "";

  return (
    <div>
      <PageHeader
        title="会議体の一覧"
        backHref="/staff/meetings"
        backLabel="ミーティングへ戻る"
        icon="book"
        description={
          isAdmin ? "参加する会議体を表示します（内容は管理者が編集できます）" : "自分が参加する会議体を表示します"
        }
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">{notice}</p>
      )}
      {errorMsg && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">{errorMsg}</p>
      )}

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/meetings/committees?month=${addMonths(month, -1)}${showAll ? "&all=1" : ""}`}
        nextHref={`/staff/meetings/committees?month=${addMonths(month, 1)}${showAll ? "&all=1" : ""}`}
      />

      {/* 自分の会議体 ⇄ すべて */}
      <div className="flex gap-1.5 mb-4">
        <a
          href={`/staff/meetings/committees?month=${month}`}
          className={`chip flex-1 justify-center !text-sm !py-2.5 ${!showAll ? "chip-active" : ""}`}
        >
          自分が出る会議体（{mineCount}）
        </a>
        <a
          href={`/staff/meetings/committees?month=${month}&all=1`}
          className={`chip flex-1 justify-center !text-sm !py-2.5 ${showAll ? "chip-active" : ""}`}
        >
          すべて見る（{rows.length}）
        </a>
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="card text-sm text-ink-500">
            参加する会議体が登録されていません。
            <a href={`/staff/meetings/committees?month=${month}&all=1`} className="font-bold text-brand-700 underline ml-1">
              すべての会議体を見る
            </a>
          </p>
        )}

        {shown.map(({ committee: t, participants, held, mine }) => {
          const done = held.filter((m) => m.minutesDone);
          const status = done.length > 0 ? "done" : held.length > 0 ? "planned" : "none";

          return (
            <section key={t.committeeKey} className="card">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold">
                    {t.name}
                    {!t.isActive && <span className="text-[11px] text-ink-400 ml-1.5">（停止中）</span>}
                  </h2>
                  <p className="text-[11px] text-ink-500">{t.cadence}</p>
                </div>
                {mine && <StatusBadge label="参加" tone="pending" />}
                {status === "done" ? (
                  <StatusBadge label="今月 実施済み" tone="ok" />
                ) : status === "planned" ? (
                  <StatusBadge label="今月 予定あり" tone="pending" />
                ) : (
                  <StatusBadge label="今月 未実施" tone="warning" />
                )}
              </div>

              <p className="text-sm text-ink-700 mt-2">{t.purpose}</p>

              {/* 参加メンバー：個別指定 → 組織図のチーム → 全員参加 の順で決まる */}
              <div className="mt-2">
                <p className="text-xs font-bold text-brand-700">参加メンバー</p>
                {isAllHands(t) ? (
                  <p className="text-xs text-ink-600 mt-0.5">全員参加の会議です</p>
                ) : participants.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {participants.map((id) => (
                      <span
                        key={id}
                        className={`text-xs font-bold rounded-full px-3 py-1 border ${
                          id === session.staffId
                            ? "border-brand-400 bg-brand-50 text-brand-800"
                            : "border-ink-300 text-ink-600"
                        }`}
                      >
                        {staffMap.get(id)?.name ?? "？"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500 mt-0.5">目安：{t.participantsHint}</p>
                )}
                {t.orgTeams.length > 0 && t.memberStaffIds.length === 0 && (
                  <p className="text-[11px] text-ink-400 mt-1">
                    担当チーム：{t.orgTeams.map(unitNameOf).join("、")}（組織図から自動で出しています）
                  </p>
                )}
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-bold text-brand-700">
                  アジェンダ・事前チェックを見る
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-ink-500">アジェンダ</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-700">{t.agenda}</p>
                  </div>
                  {t.prechecks.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-bold text-amber-800 mb-1">会議前にシステムで確認</p>
                      <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                        {t.prechecks.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>

              {held.length > 0 && (
                <p className="text-[11px] text-ink-500 mt-2">
                  今月の開催：
                  {held
                    .map(
                      (m) =>
                        `${formatDateJa(m.meetingDate)}${
                          m.minutesDone ? "（議事録あり）" : m.meetingDate <= today ? "（議事録なし）" : "（予定）"
                        }`
                    )
                    .join("、")}
                </p>
              )}

              {isAdmin && (
                <CommitteeEditor
                  committee={t}
                  staff={activeStaff.map((s) => ({ id: s.id, name: s.name }))}
                />
              )}
            </section>
          );
        })}
      </div>

      {isAdmin && (
        <details className="card mt-4">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-bold text-brand-700">
            <Icon name="plus" className="w-4 h-4" />
            会議体を追加する（管理者）
          </summary>
          <CommitteeFields staff={activeStaff.map((s) => ({ id: s.id, name: s.name }))} />
        </details>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-xs text-ink-400">
          ※ 参加メンバーは「個別指定」があればそれを、無ければ組織図（シナジーマップ）のチーム登録から出します。
          どちらも無い会議体は全員参加として扱います。
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

/** 管理者向け：既存の会議体を編集する折りたたみ */
function CommitteeEditor({
  committee,
  staff,
}: {
  committee: Committee;
  staff: { id: string; name: string }[];
}) {
  return (
    <details className="mt-3 pt-3 border-t border-ink-100">
      <summary className="cursor-pointer text-xs font-bold text-ink-500 flex items-center gap-1.5">
        <Icon name="sliders" className="w-3.5 h-3.5 text-brand-500" />
        この会議体を編集する（管理者）
      </summary>
      <CommitteeFields committee={committee} staff={staff} />
      <form action={deleteCommitteeAction} className="mt-3 pt-3 border-t border-red-100 space-y-2">
        <input type="hidden" name="committee_key" value={committee.committeeKey} />
        <label className="flex items-center gap-2 text-xs font-bold text-red-600">
          <input type="checkbox" name="confirm" className="h-4 w-4 accent-red-500" />
          この会議体を削除する（過去のミーティングの記録は残ります）
        </label>
        <button type="submit" className="btn-danger w-full">会議体を削除</button>
      </form>
    </details>
  );
}

/** 会議体の入力欄（追加・編集で共用） */
function CommitteeFields({
  committee,
  staff,
}: {
  committee?: Committee;
  staff: { id: string; name: string }[];
}) {
  const id = committee?.committeeKey ?? "new";
  return (
    <form action={saveCommitteeAction} className="mt-3 space-y-3">
      {committee && <input type="hidden" name="committee_key" value={committee.committeeKey} />}
      <div>
        <label className="label" htmlFor={`${id}-name`}>会議名</label>
        <input
          id={`${id}-name`}
          name="name"
          defaultValue={committee?.name ?? ""}
          className="input"
          placeholder="例）幹部会議"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-purpose`}>この会議で何をするのか</label>
        <textarea
          id={`${id}-purpose`}
          name="purpose"
          rows={2}
          defaultValue={committee?.purpose ?? ""}
          className="input min-h-16"
          placeholder="例）1on1の情報共有、現場の状況、教育の進捗"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`${id}-cadence`}>頻度・時間の目安</label>
          <input
            id={`${id}-cadence`}
            name="cadence"
            defaultValue={committee?.cadence ?? ""}
            className="input"
            placeholder="例）月1回（90〜120分）"
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-duration`}>想定時間（分）</label>
          <input
            id={`${id}-duration`}
            name="duration_min"
            type="number"
            min={15}
            max={600}
            step={15}
            defaultValue={committee?.durationMin ?? 60}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-agenda`}>アジェンダ（改行で複数）</label>
        <textarea
          id={`${id}-agenda`}
          name="agenda"
          rows={4}
          defaultValue={committee?.agenda ?? ""}
          className="input min-h-24"
          placeholder={"・1on1の情報共有\n・現場の状況"}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-prechecks`}>会議前に確認すること（1行に1つ）</label>
        <textarea
          id={`${id}-prechecks`}
          name="prechecks"
          rows={3}
          defaultValue={(committee?.prechecks ?? []).join("\n")}
          className="input min-h-20"
          placeholder={"1on1の記録\n未完了タスクの一覧"}
        />
      </div>
      <MemberPicker
        staff={staff}
        label="参加メンバー（指定しない場合は組織図のチームから自動）"
        selected={committee?.memberStaffIds ?? []}
      />
      <div>
        <label className="label" htmlFor={`${id}-hint`}>参加者の目安（組織図にも個別指定にも無いとき）</label>
        <input
          id={`${id}-hint`}
          name="participants_hint"
          defaultValue={committee?.participantsHint ?? ""}
          className="input"
          placeholder="例）幹部メンバー全員"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="label" htmlFor={`${id}-sort`}>並び順（小さいほど上）</label>
          <input
            id={`${id}-sort`}
            name="sort_order"
            type="number"
            min={0}
            step={10}
            defaultValue={committee?.sortOrder ?? 0}
            className="input"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-ink-600 pb-3">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={committee?.isActive ?? true}
            className="h-5 w-5 accent-brand-500"
          />
          運用中（外すと一覧から隠れます）
        </label>
      </div>
      <button type="submit" className="btn-primary w-full">
        {committee ? "この内容で更新" : "会議体を追加する"}
      </button>
    </form>
  );
}
