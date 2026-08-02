import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ORG_CHARTS, buildOrgTree, buildSynergyLinks } from "@/lib/eni/org";
import { MEETING_TEMPLATES, findTemplate } from "@/lib/eni/meetings-templates";
import { PageHeader } from "@/components/ui";
import { OrgTree } from "@/components/org-tree";
import {
  createOrgUnitAction,
  deleteOrgUnitAction,
  saveOrgTeamAction,
  saveStaffMissionAction,
  updateOrgUnitAction,
} from "./actions";

// 組織図：会社／サロンの2枚をタブで切り替え、上から下への階層で表示する。
// 管理者・幹部は、部署の追加・変更・削除、メンバー配置、一人ひとりの役割を画面から編集できる。
export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ chart?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const isExec = await isExecutive(session);
  const chartKey = ORG_CHARTS.some((c) => c.key === params.chart) ? params.chart! : "company";
  const chart = ORG_CHARTS.find((c) => c.key === chartKey)!;

  const db = getDataStore();
  const [staffList, orgUnits, orgMembers] = await Promise.all([
    db.listStaff(),
    db.listOrgUnits(),
    db.listOrgMembers(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const activeStaff = staffList.filter((s) => s.isActive);
  const unitsInChart = orgUnits.filter((u) => u.chartKey === chartKey);

  // チームごとの在籍者（退職者は除く）
  const membersByTeam = new Map<string, string[]>();
  for (const unit of orgUnits) {
    membersByTeam.set(
      unit.unitKey,
      orgMembers
        .filter((m) => m.teamKey === unit.unitKey && staffMap.get(m.staffId)?.isActive)
        .map((m) => m.staffId)
    );
  }
  const leaderOf = new Map<string, string>();
  for (const m of orgMembers) {
    if (m.roleLabel === "リーダー") leaderOf.set(m.teamKey, m.staffId);
  }

  const tree = buildOrgTree(orgUnits, chartKey);

  // 兼務している人（チーム同士の橋渡し役）
  const teamCountOf = new Map<string, number>();
  for (const [, ids] of membersByTeam) {
    for (const id of ids) teamCountOf.set(id, (teamCountOf.get(id) ?? 0) + 1);
  }
  const bridges = [...teamCountOf.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const links = buildSynergyLinks(membersByTeam);
  // 役割（ミッション）が書かれている人
  const withMission = activeStaff.filter((s) => s.mission);

  const savedMsg =
    params.saved === "created"
      ? "部署を追加しました"
      : params.saved === "updated"
        ? "部署の内容を保存しました"
        : params.saved === "deleted"
          ? "部署を削除しました"
          : params.saved === "members"
            ? "メンバーを保存しました"
            : params.saved === "mission"
              ? "役割を保存しました"
              : "";

  return (
    <div>
      <PageHeader title="組織図" backHref="/staff" />

      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">{savedMsg}</p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "編集できるのは幹部・管理者だけです" : "入力内容を確認してください"}
        </p>
      )}

      {/* 図の切り替え */}
      <div className="flex gap-1.5 mb-4">
        {ORG_CHARTS.map((c) => (
          <a
            key={c.key}
            href={`/staff/org?chart=${c.key}`}
            className={`flex-1 text-center text-sm font-bold rounded-full px-3 py-2 border ${
              chartKey === c.key ? "bg-brand-600 text-white border-brand-600" : "border-stone-300 text-stone-600"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {/* ツリー図 */}
      <section className="card mb-4">
        <p className="text-xs text-stone-500 mb-3">{chart.note}</p>
        <OrgTree nodes={tree} membersByTeam={membersByTeam} staffMap={staffMap} leaderOf={leaderOf} />
        <p className="text-[11px] text-stone-400 mt-3">
          枠の下は担当者です（「長」＝リーダー）。横にスクロールすると全体が見られます。
        </p>
      </section>

      {/* 一人ひとりの役割 */}
      {withMission.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-bold text-sm text-stone-500 mb-2">一人ひとりの役割</h2>
          <div className="space-y-2.5">
            {withMission.map((s) => (
              <div key={s.id} className="border-l-2 border-brand-300 pl-3">
                <p className="text-sm font-bold text-ink-900">{s.name}</p>
                <p className="text-xs text-ink-600 whitespace-pre-wrap mt-0.5">{s.mission}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 兼務＝チームをつなぐ人 */}
      {bridges.length > 0 && (
        <section className="card mb-4">
          <h2 className="font-bold text-sm text-stone-500 mb-2">チームをつないでいる人</h2>
          <ul className="space-y-1.5">
            {bridges.map(([staffId, count]) => {
              const teams = orgUnits.filter((u) => (membersByTeam.get(u.unitKey) ?? []).includes(staffId));
              return (
                <li key={staffId} className="text-sm">
                  <span className="font-bold">{staffMap.get(staffId)?.name ?? "？"}</span>
                  <span className="text-xs text-stone-500 ml-2">{count}チーム</span>
                  <span className="block text-[11px] text-stone-500">
                    {teams.map((t) => t.name).join(" ／ ")}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-stone-400 mt-2">
            つながっているチームの組み合わせ：{links.length}通り（兼務している人が情報の橋渡しになります）
          </p>
        </section>
      )}

      {/* 部署ごとの詳細・編集 */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm text-stone-500">部署の役割とメンバー</h2>
        {unitsInChart.map((unit) => {
          const ids = membersByTeam.get(unit.unitKey) ?? [];
          const leaderId = leaderOf.get(unit.unitKey) ?? "";
          const meeting = findTemplate(unit.meetingKey);
          const parent = orgUnits.find((u) => u.unitKey === unit.parentKey);
          return (
            <div key={unit.unitKey} className="card">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: unit.color }} />
                <p className="font-bold">{unit.name}</p>
                <span className="ml-auto text-xs font-bold text-stone-400">{ids.length}名</span>
              </div>
              {parent && <p className="text-[11px] text-stone-400 mt-0.5">上位：{parent.name}</p>}
              {unit.mission && <p className="text-xs text-ink-600 mt-1.5">{unit.mission}</p>}
              {meeting && (
                <p className="text-[11px] text-stone-500 mt-1">
                  会議体：{meeting.name}（{meeting.cadence}）
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {ids.length === 0 && <span className="text-xs text-stone-400">（メンバー未設定）</span>}
                {ids.map((id) => (
                  <span
                    key={id}
                    className={`text-xs font-bold rounded-full px-3 py-1 border ${
                      id === leaderId ? "bg-brand-600 text-white border-brand-600" : "border-stone-300 text-stone-600"
                    }`}
                  >
                    {staffMap.get(id)?.name ?? "？"}
                    {id === leaderId && "（リーダー）"}
                  </span>
                ))}
              </div>

              {isExec && (
                <div className="mt-3 space-y-2">
                  {/* メンバー設定 */}
                  <details className="rounded-xl border border-brand-200">
                    <summary className="cursor-pointer text-sm font-bold text-brand-700 px-3 py-2">
                      メンバーを設定する
                    </summary>
                    <form action={saveOrgTeamAction} className="p-3 pt-0 space-y-3">
                      <input type="hidden" name="team_key" value={unit.unitKey} />
                      <input type="hidden" name="chart_key" value={chartKey} />
                      <div>
                        <p className="label !mb-2 !text-xs">メンバー（複数選択）</p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeStaff.map((s) => (
                            <label
                              key={s.id}
                              className="text-xs font-bold rounded-full px-3 py-1.5 border border-stone-300 text-stone-600 cursor-pointer has-checked:bg-brand-600 has-checked:text-white has-checked:border-brand-600"
                            >
                              <input
                                type="checkbox"
                                name="members"
                                value={s.id}
                                defaultChecked={ids.includes(s.id)}
                                className="hidden"
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="label !text-xs" htmlFor={`leader-${unit.unitKey}`}>リーダー</label>
                        <select
                          id={`leader-${unit.unitKey}`}
                          name="leader_staff_id"
                          defaultValue={leaderId}
                          className="input !min-h-10 !py-2 text-sm"
                        >
                          <option value="">（なし）</option>
                          {activeStaff.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn-secondary w-full !min-h-11 !py-2 text-sm">
                        メンバーを保存
                      </button>
                    </form>
                  </details>

                  {/* 部署自体の編集 */}
                  <details className="rounded-xl border border-stone-200">
                    <summary className="cursor-pointer text-sm font-bold text-stone-600 px-3 py-2">
                      この部署を編集する
                    </summary>
                    <form action={updateOrgUnitAction} className="p-3 pt-0 space-y-2">
                      <input type="hidden" name="unit_key" value={unit.unitKey} />
                      <input type="hidden" name="chart_key" value={chartKey} />
                      <div>
                        <label className="label !text-xs" htmlFor={`name-${unit.unitKey}`}>部署名</label>
                        <input id={`name-${unit.unitKey}`} name="name" defaultValue={unit.name} className="input !min-h-10 !py-2 text-sm" required />
                      </div>
                      <div>
                        <label className="label !text-xs" htmlFor={`mission-${unit.unitKey}`}>担っていること</label>
                        <textarea id={`mission-${unit.unitKey}`} name="mission" rows={2} defaultValue={unit.mission} className="input min-h-16 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label !text-xs" htmlFor={`parent-${unit.unitKey}`}>上位の部署</label>
                          <select id={`parent-${unit.unitKey}`} name="parent_key" defaultValue={unit.parentKey} className="input !min-h-10 !py-2 text-sm">
                            <option value="">（最上位）</option>
                            {unitsInChart
                              .filter((u) => u.unitKey !== unit.unitKey)
                              .map((u) => (<option key={u.unitKey} value={u.unitKey}>{u.name}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="label !text-xs" htmlFor={`meeting-${unit.unitKey}`}>会議体</label>
                          <select id={`meeting-${unit.unitKey}`} name="meeting_key" defaultValue={unit.meetingKey} className="input !min-h-10 !py-2 text-sm">
                            <option value="">（なし）</option>
                            {MEETING_TEMPLATES.map((t) => (<option key={t.key} value={t.key}>{t.name}</option>))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label !text-xs" htmlFor={`sort-${unit.unitKey}`}>並び順</label>
                          <input id={`sort-${unit.unitKey}`} name="sort_order" type="number" defaultValue={unit.sortOrder} className="input !min-h-10 !py-2 text-sm" />
                        </div>
                        <div>
                          <label className="label !text-xs" htmlFor={`color-${unit.unitKey}`}>色</label>
                          <input id={`color-${unit.unitKey}`} name="color" type="color" defaultValue={unit.color} className="input !min-h-10 !py-1" />
                        </div>
                      </div>
                      <button type="submit" className="btn-secondary w-full !min-h-11 !py-2 text-sm">この部署を保存</button>
                    </form>
                    <form action={deleteOrgUnitAction} className="px-3 pb-3">
                      <input type="hidden" name="unit_key" value={unit.unitKey} />
                      <input type="hidden" name="chart_key" value={chartKey} />
                      <button type="submit" className="text-xs font-bold text-red-500 underline">
                        この部署を削除（下の部署は最上位に移ります）
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 部署の追加 */}
      {isExec && (
        <details className="card mt-4">
          <summary className="font-bold text-sm text-brand-700 cursor-pointer">＋ 部署・チームを追加する</summary>
          <form action={createOrgUnitAction} className="space-y-2 mt-3 pt-3 border-t border-stone-100">
            <input type="hidden" name="chart_key" value={chartKey} />
            <div>
              <label className="label !text-xs" htmlFor="new_unit_name">部署名</label>
              <input id="new_unit_name" name="name" className="input !min-h-10 !py-2 text-sm" placeholder="例）撮影チーム" required />
            </div>
            <div>
              <label className="label !text-xs" htmlFor="new_unit_parent">上位の部署</label>
              <select id="new_unit_parent" name="parent_key" className="input !min-h-10 !py-2 text-sm" defaultValue="">
                <option value="">（最上位）</option>
                {unitsInChart.map((u) => (<option key={u.unitKey} value={u.unitKey}>{u.name}</option>))}
              </select>
            </div>
            <div>
              <label className="label !text-xs" htmlFor="new_unit_mission">担っていること</label>
              <textarea id="new_unit_mission" name="mission" rows={2} className="input min-h-16 text-sm" />
            </div>
            <button type="submit" className="btn-primary w-full">追加する</button>
          </form>
        </details>
      )}

      {/* 一人ひとりの役割の編集 */}
      {isExec && (
        <details className="card mt-4">
          <summary className="font-bold text-sm text-brand-700 cursor-pointer">一人ひとりの役割を書く</summary>
          <div className="mt-3 pt-3 border-t border-stone-100 space-y-3">
            {activeStaff.map((s) => (
              <form key={s.id} action={saveStaffMissionAction} className="space-y-1.5">
                <input type="hidden" name="staff_id" value={s.id} />
                <input type="hidden" name="chart_key" value={chartKey} />
                <label className="label !text-xs" htmlFor={`mission-staff-${s.id}`}>{s.name}</label>
                <textarea
                  id={`mission-staff-${s.id}`}
                  name="mission"
                  rows={2}
                  defaultValue={s.mission}
                  placeholder="例）理念の体現者。目標の進捗と実行に責任を持ち、チームを動かす。"
                  className="input min-h-16 text-sm"
                />
                <button type="submit" className="btn-secondary w-full !min-h-10 !py-1.5 text-xs">
                  {s.name}さんの役割を保存
                </button>
              </form>
            ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-center">
        <Link href="/staff/meetings/committees" className="text-sm font-bold text-brand-700 underline">
          会議体の一覧を見る
        </Link>
      </p>
    </div>
  );
}
