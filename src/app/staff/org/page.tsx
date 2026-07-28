import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { ORG_TEAMS, buildSynergyLinks } from "@/lib/eni/org";
import { findTemplate } from "@/lib/eni/meetings-templates";
import { PageHeader } from "@/components/ui";
import { SynergyMap } from "@/components/synergy-map";
import { saveOrgTeamAction } from "./actions";

// 組織図（シナジーマップ）：チームと、そこに誰がいるかを一枚で見る。
// 兼務している人がチームとチームをつなぐ＝情報が流れる線として描かれる。
export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const isExec = await isExecutive(session);

  const db = getDataStore();
  const [staffList, orgMembers] = await Promise.all([db.listStaff(), db.listOrgMembers()]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const activeStaff = staffList.filter((s) => s.isActive && s.jobType !== "");

  // チームごとの在籍者（退職者は除く）
  const membersByTeam = new Map<string, string[]>();
  for (const team of ORG_TEAMS) {
    membersByTeam.set(
      team.key,
      orgMembers.filter((m) => m.teamKey === team.key && staffMap.get(m.staffId)?.isActive).map((m) => m.staffId)
    );
  }
  const leaderOf = new Map<string, string>();
  for (const m of orgMembers) {
    if (m.roleLabel === "リーダー") leaderOf.set(m.teamKey, m.staffId);
  }

  const links = buildSynergyLinks(membersByTeam);
  // 兼務している人（複数チームに入っている人）＝チーム間の橋渡し役
  const teamCountOf = new Map<string, number>();
  for (const [, ids] of membersByTeam) {
    for (const id of ids) teamCountOf.set(id, (teamCountOf.get(id) ?? 0) + 1);
  }
  const bridges = [...teamCountOf.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);
  const noTeam = activeStaff.filter((s) => !teamCountOf.has(s.id));

  const savedTeam = params.saved ? ORG_TEAMS.find((t) => t.key === params.saved) : undefined;

  return (
    <div>
      <PageHeader title="組織図（シナジーマップ）" backHref="/staff" />

      {savedTeam && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {savedTeam.name}のメンバーを保存しました
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "編集できるのは幹部・管理者だけです" : "入力内容を確認してください"}
        </p>
      )}

      {/* 図 */}
      <section className="card mb-4">
        <SynergyMap membersByTeam={membersByTeam} />
        <p className="text-[11px] text-stone-400 mt-2">
          中心が理念、まわりが各チーム。チーム同士をつなぐ太い線は「両方に入っている人」の数です。
          線が多いほど、チーム間で情報が流れやすい状態を表します。
        </p>
      </section>

      {/* 兼務している人（橋渡し役） */}
      <section className="card mb-4">
        <h2 className="font-bold text-sm text-stone-500 mb-2">チームをつないでいる人</h2>
        {bridges.length === 0 ? (
          <p className="text-xs text-stone-400">
            まだ複数チームを兼務している人がいません（チーム同士の情報が分断されやすい状態です）。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bridges.map(([staffId, count]) => {
              const teams = ORG_TEAMS.filter((t) => (membersByTeam.get(t.key) ?? []).includes(staffId));
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
        )}
        {links.length > 0 && (
          <p className="text-[11px] text-stone-400 mt-2">つながっているチームの組み合わせ：{links.length}通り</p>
        )}
      </section>

      {/* チームごとの詳細 */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm text-stone-500">チームの役割とメンバー</h2>
        {ORG_TEAMS.map((team) => {
          const ids = membersByTeam.get(team.key) ?? [];
          const leaderId = leaderOf.get(team.key) ?? "";
          const meeting = findTemplate(team.meetingKey);
          return (
            <div key={team.key} className="card">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                <p className="font-bold">{team.name}</p>
                <span className="ml-auto text-xs font-bold text-stone-400">{ids.length}名</span>
              </div>
              <p className="text-xs text-ink-600 mt-1.5">{team.mission}</p>
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
                <details className="mt-3 rounded-xl border border-brand-200">
                  <summary className="cursor-pointer text-sm font-bold text-brand-700 px-3 py-2">
                    メンバーを設定する（幹部）
                  </summary>
                  <form action={saveOrgTeamAction} className="p-3 pt-0 space-y-3">
                    <input type="hidden" name="team_key" value={team.key} />
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
                      <label className="label !text-xs" htmlFor={`leader-${team.key}`}>リーダー</label>
                      <select
                        id={`leader-${team.key}`}
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
                      このチームを保存
                    </button>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </section>

      {noTeam.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mt-4">
          <p className="text-sm font-bold text-amber-800 mb-1">どのチームにも入っていない人（{noTeam.length}名）</p>
          <p className="text-xs text-amber-700">{noTeam.map((s) => s.name).join("、")}</p>
        </div>
      )}

      <p className="mt-4 text-center">
        <Link href="/staff/meetings/committees" className="text-sm font-bold text-brand-700 underline">
          会議体の一覧を見る
        </Link>
      </p>
    </div>
  );
}
