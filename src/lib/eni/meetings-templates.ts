// 会議体（定例ミーティング）のテンプレート。
// 会議作成時に、種類・頻度・参加者の目安・アジェンダ・事前チェックを自動で入れる。
// orgTeams は組織図（シナジーマップ）のチームキー。実際の参加メンバーはそこから引く。

export interface MeetingTemplate {
  key: string;
  name: string; // 会議名
  purpose: string; // この会議で何をするのか（1〜2行）
  cadence: string; // 頻度・時間の目安
  durationMin: number; // 想定時間（分。会議の枠取りに使う）
  participantsHint: string; // 参加メンバーの目安（名前）
  orgTeams: string[]; // 対応する組織図のチーム（lib/eni/org.ts のキー）
  agenda: string; // アジェンダ（議題）
  prechecks: string[]; // 会議前にシステムで見ておく項目（進捗チェック）
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    key: "exec",
    name: "幹部会議",
    purpose:
      "みんなの1on1の情報共有をする。現場の状況、教育の進捗、方針の共有、材料の選定・精査、キャンペーンの進捗確認や作成。",
    cadence: "月1回（90〜120分）",
    durationMin: 120,
    participantsHint: "中、岡（店長）、高橋、松本",
    orgTeams: ["exec"],
    agenda:
      "・みんなの1on1の情報共有\n・現場の状況\n・教育の進捗\n・中さんの方針・情報共有\n・材料の選定/精査\n・キャンペーンの進捗確認/作成",
    prechecks: ["1on1の記録（ミーティング一覧）", "各チームの週報・日報", "発注・材料の申請状況", "未完了タスクの一覧"],
  },
  {
    key: "education",
    name: "教育チームミーティング",
    purpose: "コンピテンシーカリキュラムの進捗確認、課題の洗い出し、技術練習の進捗確認。",
    cadence: "月1回（90〜120分）",
    durationMin: 120,
    participantsHint: "岡（店長）、高橋、松本",
    orgTeams: ["education"],
    agenda: "・コンピテンシーカリキュラムの進捗確認\n・課題の洗い出し\n・技術練習の進捗確認",
    prechecks: ["アシスタント週報（ランク別）", "練習の記録・ペア", "スタイリスト日報の指導メモ"],
  },
  {
    key: "pr",
    name: "広報ミーティング（採用・SNS）",
    purpose:
      "【SNS】現状の確認と今後のアクション（投稿内容を決める）。【採用】学校への連絡など基本採用事項の確認。",
    cadence: "月1回（60分）",
    durationMin: 60,
    participantsHint: "SNS：中、松本 ／ 採用：中、高橋、大河原、根来",
    orgTeams: ["pr_sns", "pr_recruit"],
    agenda:
      "【SNS】現状の確認、今後のアクション（投稿内容を決める）\n【採用】学校への連絡など基本採用事項の確認",
    prechecks: ["前回のSNSアクションの実施状況", "採用の連絡先リスト・進捗"],
  },
  {
    key: "materials",
    name: "商材チームミーティング",
    purpose:
      "材料比率や使いすぎがないかの確認。シーズンキャンペーンの企画、POPの制作。稼働チェックや運用の仕方、ロープレの計画。",
    cadence: "月1回（60分）",
    durationMin: 60,
    participantsHint: "岡、中、親川、藪中、太田",
    orgTeams: ["materials"],
    agenda:
      "・材料比率/使いすぎの確認\n・シーズンキャンペーンの企画\n・POPの制作\n・稼働チェック/運用の仕方\n・ロープレの計画",
    prechecks: ["発注・購入申請の一覧", "商材の稼働状況（日報の店販売上）"],
  },
  {
    key: "assistant",
    name: "アシスタントミーティング",
    purpose:
      "アシスタントの目標に対しての進捗を共有し、理解できていないことを拾う。アシスタントが主体で運営し、幹部層はあまりタッチしない。",
    cadence: "月1回（120分・アシスタント主体）",
    durationMin: 120,
    participantsHint: "アシスタント全員",
    orgTeams: ["assistant"],
    agenda: "・目標に対しての進捗共有\n・理解できていないことを拾う\n※事前に「何をやるのか」を共有してから実施",
    prechecks: ["自分たちの週報（目標の進捗）", "練習時間の合計"],
  },
  {
    key: "all",
    name: "全体ミーティング",
    purpose: "幹部mtgの共有事項。理念の再浸透。各チームが話したいことがあれば話す。",
    cadence: "月1回（120分）",
    durationMin: 120,
    participantsHint: "全員",
    orgTeams: [],
    agenda: "・幹部mtgの共有事項\n・理念の再浸透\n・各チームが話したいこと",
    prechecks: ["幹部会議の議事録", "各チームの議事録"],
  },
  {
    key: "study",
    name: "勉強会（しもん塾）",
    purpose: "理念の浸透。知識・ノウハウを学習させていく。",
    cadence: "月1回（90分）",
    durationMin: 90,
    participantsHint: "全員",
    orgTeams: [],
    agenda: "・理念の浸透\n・知識/ノウハウの学習",
    prechecks: [],
  },
];

export function findTemplate(key: string): MeetingTemplate | undefined {
  return MEETING_TEMPLATES.find((t) => t.key === key);
}
