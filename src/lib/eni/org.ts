// 組織図（シナジーマップ）のチーム定義。
// 「誰がどのチームにいるか」はDB（org_members）に持ち、チームの意味づけはここで固定する。
// 兼務（複数チームに入っている人）がチーム同士をつなぐ線になり、シナジーとして見える。

export interface OrgTeam {
  key: string;
  name: string; // チーム名
  short: string; // 図の中に書く短い名前（2〜4文字）
  mission: string; // このチームが担うこと
  meetingKey: string; // 対応する会議体（lib/eni/meetings-templates.ts のキー。無ければ空）
  color: string; // 図と一覧で使う色（Tailwindのクラスではなく実際の色コード）
}

export const ORG_TEAMS: OrgTeam[] = [
  {
    key: "exec",
    name: "幹部（経営）チーム",
    short: "幹部",
    mission: "方針決定と全体の舵取り。1on1の情報を集めて、現場・教育・材料・キャンペーンを判断する。",
    meetingKey: "exec",
    color: "#94815a",
  },
  {
    key: "education",
    name: "教育チーム",
    short: "教育",
    mission: "コンピテンシーカリキュラムの運用。課題の洗い出しと技術練習の進捗管理。",
    meetingKey: "education",
    color: "#0891b2",
  },
  {
    key: "pr_sns",
    name: "広報チーム（SNS）",
    short: "SNS",
    mission: "SNSの現状把握と投稿内容の決定。お店の見え方をつくる。",
    meetingKey: "pr",
    color: "#e11d48",
  },
  {
    key: "pr_recruit",
    name: "採用チーム",
    short: "採用",
    mission: "学校への連絡など基本採用事項の確認。次に入るメンバーを迎える準備。",
    meetingKey: "pr",
    color: "#7c3aed",
  },
  {
    key: "materials",
    name: "商材チーム",
    short: "商材",
    mission: "材料比率・使いすぎの確認、シーズンキャンペーンの企画、POP制作、稼働チェックとロープレ計画。",
    meetingKey: "materials",
    color: "#059669",
  },
  {
    key: "assistant",
    name: "アシスタントチーム",
    short: "アシ",
    mission: "アシスタントが主体で運営。目標の進捗共有と、分からないことを拾い合う。",
    meetingKey: "assistant",
    color: "#d97706",
  },
];

export function findTeam(key: string): OrgTeam | undefined {
  return ORG_TEAMS.find((t) => t.key === key);
}

export interface SynergyLink {
  fromIndex: number;
  toIndex: number;
  sharedStaffIds: string[]; // 両チームを兼務している人
}

/**
 * チーム間のつながり（シナジー）を計算する。
 * 同じ人が2つのチームに入っていれば、その2チームはつながっている＝情報が流れる。
 */
export function buildSynergyLinks(membersByTeam: Map<string, string[]>): SynergyLink[] {
  const links: SynergyLink[] = [];
  for (let i = 0; i < ORG_TEAMS.length; i++) {
    for (let j = i + 1; j < ORG_TEAMS.length; j++) {
      const a = membersByTeam.get(ORG_TEAMS[i].key) ?? [];
      const b = new Set(membersByTeam.get(ORG_TEAMS[j].key) ?? []);
      const shared = a.filter((id) => b.has(id));
      if (shared.length > 0) links.push({ fromIndex: i, toIndex: j, sharedStaffIds: shared });
    }
  }
  return links;
}

/** 円周上に等間隔で並べたときのチームの座標（SVG用） */
export function teamPosition(index: number, total: number, radius: number, center: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2; // 12時方向から時計回り
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}
