// 組織図（シナジーマップ）の図。中心に理念、まわりにチームを置き、
// 兼務している人がいるチーム同士を線でつなぐ（線が太いほど人が重なっている＝情報が流れやすい）。
// SVGだけで描くのでJSは不要（サーバーコンポーネントのまま使える）。

import { ORG_TEAMS, buildSynergyLinks, teamPosition } from "@/lib/eni/org";

const SIZE = 360;
const CENTER = SIZE / 2;
const RADIUS = 118;
const NODE_R = 34;

export function SynergyMap({
  membersByTeam,
  centerLabel = "ENi",
  centerSub = "理念",
}: {
  membersByTeam: Map<string, string[]>;
  centerLabel?: string;
  centerSub?: string;
}) {
  const links = buildSynergyLinks(membersByTeam);
  const positions = ORG_TEAMS.map((_, i) => teamPosition(i, ORG_TEAMS.length, RADIUS, CENTER));

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full h-auto"
      role="img"
      aria-label="チームのつながりを表した組織図"
    >
      {/* 中心とチームを結ぶ細い線（全チームは理念でつながっている） */}
      {positions.map((p, i) => (
        <line
          key={`spoke-${i}`}
          x1={CENTER}
          y1={CENTER}
          x2={p.x}
          y2={p.y}
          stroke="#e7ddc4"
          strokeWidth={1.5}
        />
      ))}

      {/* 兼務によるチーム同士のつながり */}
      {links.map((l, i) => {
        const a = positions[l.fromIndex];
        const b = positions[l.toIndex];
        return (
          <line
            key={`link-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#a99668"
            strokeWidth={Math.min(6, 1.5 + l.sharedStaffIds.length * 1.5)}
            strokeOpacity={0.45}
            strokeLinecap="round"
          />
        );
      })}

      {/* 中心（理念） */}
      <circle cx={CENTER} cy={CENTER} r={38} fill="#413828" />
      <text x={CENTER} y={CENTER - 3} textAnchor="middle" fill="#f3efe2" fontSize={15} fontWeight="bold">
        {centerLabel}
      </text>
      <text x={CENTER} y={CENTER + 13} textAnchor="middle" fill="#d5c6a0" fontSize={10}>
        {centerSub}
      </text>

      {/* チーム */}
      {ORG_TEAMS.map((team, i) => {
        const p = positions[i];
        const count = (membersByTeam.get(team.key) ?? []).length;
        return (
          <g key={team.key}>
            <circle cx={p.x} cy={p.y} r={NODE_R} fill="#ffffff" stroke={team.color} strokeWidth={2.5} />
            <text x={p.x} y={p.y - 2} textAnchor="middle" fill={team.color} fontSize={13} fontWeight="bold">
              {team.short}
            </text>
            <text x={p.x} y={p.y + 13} textAnchor="middle" fill="#a8a29e" fontSize={10}>
              {count}名
            </text>
          </g>
        );
      })}
    </svg>
  );
}
