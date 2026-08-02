// 組織図の初期定義とユーティリティ。
// 部署・チームはDB（org_units）に持ち、管理者が画面から追加・変更できる。
// ここにあるのは「初期データ（お渡しいただいた組織図）」と、表示に使う計算だけ。

import type { OrgUnit } from "@/lib/data/types";

export interface OrgChart {
  key: string;
  name: string;
  note: string;
}

export const ORG_CHARTS: OrgChart[] = [
  { key: "company", name: "会社組織図", note: "会社の機能（広報・採用・商材・教育）と担当" },
  { key: "salon", name: "サロン組織図", note: "店舗の体制（店長・副店長・スタイリスト・アシスタント）" },
];

/** 初期の組織図（2025年11月13日版）。DBが空のときに投入される */
export const DEFAULT_ORG_UNITS: Omit<OrgUnit, "id">[] = [
  // ---- 会社組織図 ----
  { chartKey: "company", unitKey: "ceo", parentKey: "", name: "代表取締役社長", mission: "経営（道が栄えるようにする）。人脈・情報・チャンス・会社の土台・全体教育・数字・戦略。", meetingKey: "exec", color: "#7c6242", sortOrder: 10 },
  { chartKey: "company", unitKey: "soumu", parentKey: "ceo", name: "総務", mission: "会社の事務・労務・お金まわりの管理。", meetingKey: "", color: "#78716c", sortOrder: 20 },

  { chartKey: "company", unitKey: "pr", parentKey: "ceo", name: "広報", mission: "お店と会社の見え方をつくる。発信とコミュニティ。", meetingKey: "pr", color: "#e11d48", sortOrder: 30 },
  { chartKey: "company", unitKey: "pr_sns", parentKey: "pr", name: "会社SNS", mission: "会社アカウントの運用。現状確認と投稿内容の決定。", meetingKey: "pr", color: "#e11d48", sortOrder: 31 },
  { chartKey: "company", unitKey: "pr_community", parentKey: "pr", name: "コミュニティ運営", mission: "お客様・仲間とのつながりの場をつくる。", meetingKey: "pr", color: "#e11d48", sortOrder: 32 },
  { chartKey: "company", unitKey: "pr_seminar", parentKey: "pr", name: "セミナーイベント", mission: "セミナー・イベントの企画と運営。", meetingKey: "pr", color: "#e11d48", sortOrder: 33 },
  { chartKey: "company", unitKey: "pr_contest", parentKey: "pr", name: "コンテストサポート", mission: "コンテスト出場のサポート。", meetingKey: "pr", color: "#e11d48", sortOrder: 34 },

  { chartKey: "company", unitKey: "recruit", parentKey: "ceo", name: "採用", mission: "次に入る仲間を迎える。学校連絡など基本採用事項。", meetingKey: "pr", color: "#7c3aed", sortOrder: 40 },
  { chartKey: "company", unitKey: "recruit_school", parentKey: "recruit", name: "学校訪問営業", mission: "美容学校への訪問・関係づくり。", meetingKey: "pr", color: "#7c3aed", sortOrder: 41 },
  { chartKey: "company", unitKey: "recruit_docs", parentKey: "recruit", name: "資料制作・データ管理", mission: "採用資料の制作と応募データの管理。", meetingKey: "pr", color: "#7c3aed", sortOrder: 42 },
  { chartKey: "company", unitKey: "recruit_support", parentKey: "recruit", name: "入社前サポート", mission: "内定者が安心して入社できるようにする。", meetingKey: "pr", color: "#7c3aed", sortOrder: 43 },

  { chartKey: "company", unitKey: "materials", parentKey: "ceo", name: "商材", mission: "材料比率・使いすぎの確認、キャンペーン企画、POP制作、稼働チェック。", meetingKey: "materials", color: "#059669", sortOrder: 50 },
  { chartKey: "company", unitKey: "mat_cost", parentKey: "materials", name: "材料費管理", mission: "材料費の把握と適正化。", meetingKey: "materials", color: "#059669", sortOrder: 51 },
  { chartKey: "company", unitKey: "mat_dealer", parentKey: "materials", name: "ディーラー・メーカー対応", mission: "ディーラー／メーカーとのやりとり。", meetingKey: "materials", color: "#059669", sortOrder: 52 },
  { chartKey: "company", unitKey: "mat_dev", parentKey: "materials", name: "開発", mission: "新しい商材・メニューの開発。", meetingKey: "materials", color: "#059669", sortOrder: 53 },

  { chartKey: "company", unitKey: "education", parentKey: "ceo", name: "教育", mission: "カリキュラムの運用と技術・価値観の底上げ。", meetingKey: "education", color: "#0891b2", sortOrder: 60 },
  { chartKey: "company", unitKey: "edu_curriculum", parentKey: "education", name: "技術カリキュラム", mission: "技術カリキュラムの作成・進捗管理。", meetingKey: "education", color: "#0891b2", sortOrder: 61 },
  { chartKey: "company", unitKey: "edu_competency", parentKey: "education", name: "コンピテンシー", mission: "コンピテンシーの運用と評価。", meetingKey: "education", color: "#0891b2", sortOrder: 62 },
  { chartKey: "company", unitKey: "edu_sns", parentKey: "education", name: "個人SNS", mission: "個人SNSの発信サポート・指導。", meetingKey: "education", color: "#0891b2", sortOrder: 63 },

  // ---- サロン組織図 ----
  { chartKey: "salon", unitKey: "salon_ceo", parentKey: "", name: "代表取締役社長", mission: "サロン全体の方針。", meetingKey: "exec", color: "#7c6242", sortOrder: 10 },
  { chartKey: "salon", unitKey: "tencho", parentKey: "salon_ceo", name: "店長", mission: "理念の体現者。目標の進捗と実行に責任を持ち、チームを動かす執行責任者。幹部候補の育成。", meetingKey: "exec", color: "#94815a", sortOrder: 20 },
  { chartKey: "salon", unitKey: "fuku_tencho", parentKey: "salon_ceo", name: "副店長", mission: "店長と連携し、チームの実行管理と水質管理を行う。", meetingKey: "exec", color: "#a8956d", sortOrder: 30 },
  { chartKey: "salon", unitKey: "stylist_a", parentKey: "tencho", name: "スタイリスト", mission: "サロンワークと売上づくり。アシスタントの指導。", meetingKey: "", color: "#0891b2", sortOrder: 21 },
  { chartKey: "salon", unitKey: "assistant_a", parentKey: "tencho", name: "アシスタント", mission: "サロンワークの動き・接客・技術の習得。デビューに向けた練習。", meetingKey: "assistant", color: "#d97706", sortOrder: 22 },
  { chartKey: "salon", unitKey: "stylist_b", parentKey: "fuku_tencho", name: "スタイリスト", mission: "サロンワークと売上づくり。アシスタントの指導。", meetingKey: "", color: "#0891b2", sortOrder: 31 },
  { chartKey: "salon", unitKey: "assistant_b", parentKey: "fuku_tencho", name: "アシスタント", mission: "サロンワークの動き・接客・技術の習得。デビューに向けた練習。", meetingKey: "assistant", color: "#d97706", sortOrder: 32 },
];

/** 親子関係のツリー（表示用） */
export interface OrgNode {
  unit: OrgUnit;
  children: OrgNode[];
}

export function buildOrgTree(units: OrgUnit[], chartKey: string): OrgNode[] {
  const inChart = units
    .filter((u) => u.chartKey === chartKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const byKey = new Map(inChart.map((u) => [u.unitKey, { unit: u, children: [] } as OrgNode]));
  const roots: OrgNode[] = [];
  for (const node of byKey.values()) {
    const parent = node.unit.parentKey ? byKey.get(node.unit.parentKey) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export interface SynergyLink {
  fromKey: string;
  toKey: string;
  sharedStaffIds: string[]; // 両チームを兼務している人
}

/**
 * チーム間のつながり（シナジー）を計算する。
 * 同じ人が2つのチームに入っていれば、その2チームはつながっている＝情報が流れる。
 */
export function buildSynergyLinks(membersByTeam: Map<string, string[]>): SynergyLink[] {
  const keys = [...membersByTeam.keys()];
  const links: SynergyLink[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = membersByTeam.get(keys[i]) ?? [];
      const b = new Set(membersByTeam.get(keys[j]) ?? []);
      const shared = a.filter((id) => b.has(id));
      if (shared.length > 0) links.push({ fromKey: keys[i], toKey: keys[j], sharedStaffIds: shared });
    }
  }
  return links;
}

/** 新しい部署キーを作る（英数字が無い日本語名でも衝突しないようにする） */
export function makeUnitKey(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`unit_${n}`)) n++;
  return `unit_${n}`;
}
