// 組織図のツリー表示（お渡しいただいた組織図の形）。
// 上から下へ、親と子を縦線・横線でつなぐ。子はスマホでは縦積み、広い画面では横並びになる。

import type { OrgNode } from "@/lib/eni/org";
import type { Staff } from "@/lib/data/types";

export function OrgTree({
  nodes,
  membersByTeam,
  staffMap,
  leaderOf,
}: {
  nodes: OrgNode[];
  membersByTeam: Map<string, string[]>;
  staffMap: Map<string, Staff>;
  leaderOf: Map<string, string>;
}) {
  if (nodes.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-6">部署がまだ登録されていません</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max mx-auto flex justify-center gap-6 p-1">
        {nodes.map((node) => (
          <OrgBranch
            key={node.unit.unitKey}
            node={node}
            membersByTeam={membersByTeam}
            staffMap={staffMap}
            leaderOf={leaderOf}
          />
        ))}
      </div>
    </div>
  );
}

function OrgBranch({
  node,
  membersByTeam,
  staffMap,
  leaderOf,
}: {
  node: OrgNode;
  membersByTeam: Map<string, string[]>;
  staffMap: Map<string, Staff>;
  leaderOf: Map<string, string>;
}) {
  const ids = membersByTeam.get(node.unit.unitKey) ?? [];
  const leaderId = leaderOf.get(node.unit.unitKey) ?? "";
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* 自分のカード */}
      <div
        className="rounded-xl border-2 bg-white px-3 py-2 min-w-32 max-w-56 text-center shadow-sm"
        style={{ borderColor: node.unit.color }}
      >
        <p className="text-sm font-bold text-ink-900 leading-tight">{node.unit.name}</p>
        {ids.length > 0 && (
          <p className="text-[10px] text-ink-500 mt-1 leading-snug">
            {ids
              .map((id) => `${staffMap.get(id)?.name ?? "？"}${id === leaderId ? "（長）" : ""}`)
              .join("・")}
          </p>
        )}
        {ids.length === 0 && <p className="text-[10px] text-ink-300 mt-1">担当未設定</p>}
      </div>

      {/* 子へ伸びる線 */}
      {hasChildren && (
        <>
          <span className="w-px h-4 bg-ink-300" />
          <div className="relative flex gap-4">
            {/* 子が2つ以上のときは横線でつなぐ */}
            {node.children.length > 1 && (
              <span className="absolute top-0 left-0 right-0 mx-auto h-px bg-ink-300"
                style={{ width: "calc(100% - 6rem)" }} />
            )}
            {node.children.map((child) => (
              <div key={child.unit.unitKey} className="flex flex-col items-center">
                <span className="w-px h-4 bg-ink-300" />
                <OrgBranch
                  node={child}
                  membersByTeam={membersByTeam}
                  staffMap={staffMap}
                  leaderOf={leaderOf}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
