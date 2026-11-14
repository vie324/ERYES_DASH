// 通知（Web Push）の種類。本人が「通知の設定」画面で、種類ごとにオン・オフできる単位。
// 通知を送るところ（sendPush / notifyQuietly）で kind を付けると、止めている人には送らない。
// kind を付けない通知（テスト通知など）は設定に関係なく届く。

export type PushKind = "chat" | "mention" | "announce" | "morning" | "task" | "thanks" | "shift" | "absence" | "report";

export interface PushKindDef {
  key: PushKind;
  label: string;
  note: string;
  /** 幹部・管理者にしか届かない種類（設定画面でほかの人には出さない） */
  execOnly?: boolean;
}

export const PUSH_KINDS: PushKindDef[] = [
  { key: "chat", label: "トークの新着", note: "入っているトーク（全体共有を含む）に新しい投稿があったとき" },
  { key: "mention", label: "自分あてのメンション", note: "トークで自分あてに @ が付いたとき" },
  { key: "announce", label: "アナウンス", note: "全体共有の投稿が、ホームのアナウンス欄に固定されたとき" },
  {
    key: "morning",
    label: "毎朝のリマインド",
    note: "その日の未完了のタスク・ルーティンや未読のトークが残っているとき（毎朝決まった時刻）",
  },
  { key: "task", label: "タスクの依頼", note: "タスクを依頼された・幹部タスクや議事録のタスクを割り当てられたとき" },
  { key: "thanks", label: "サンクスカード", note: "サンクスカードが届いたとき" },
  { key: "shift", label: "シフト・希望休", note: "シフトの公開・変更、希望休の募集・締切が近いとき" },
  { key: "absence", label: "欠勤・早退の報告", note: "欠勤・早退の報告が届いたとき", execOnly: true },
  { key: "report", label: "日報へのコメント", note: "日報にコメントがついたとき・自分のコメントに返信があったとき" },
];

export function isPushKind(v: unknown): v is PushKind {
  return PUSH_KINDS.some((k) => k.key === v);
}

/** 止めている種類の一覧を、定義にある種類だけにそろえる（保存前の確認） */
export function normalizeDisabledKinds(raw: unknown[]): PushKind[] {
  return [...new Set(raw.filter(isPushKind))];
}

/**
 * その種類の通知を受け取る人だけに絞る。
 * 設定の行が無い人・止めていない人には送る（初期値はすべて受け取る）。
 */
export function filterByPreference(
  staffIds: string[],
  prefs: { staffId: string; disabledKinds: string[] }[],
  kind: PushKind | undefined
): string[] {
  if (!kind) return staffIds;
  const off = new Set(prefs.filter((p) => p.disabledKinds.includes(kind)).map((p) => p.staffId));
  return staffIds.filter((id) => !off.has(id));
}
