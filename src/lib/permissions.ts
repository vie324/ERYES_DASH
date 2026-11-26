// 人ごとに付ける権限（ロール＝管理者・幹部などとは別に、1人ずつ付け外しする権限）。
// 依頼7の「人ごとに付ける権限」がまだ入っていないため、同じ考え方の最小の仕組みをここに作った。
// 依頼7が入ったら、この PERMISSION_DEFS に項目を足していけばよい。
//
//  ・ownerOnly …… 代表（staff.is_owner）にしか付けられない権限。アプリの画面からは代表本人しか付け外しできず、
//                 管理者でも自分には付けられない（相談の閲覧・AIしもんの教育・Claudeからの読み取り）
//  ・それ以外 …… 管理者がマスタ設定（/admin/permissions）で付け外しする
// 判定は画面だけでなく、サーバーの処理・APIでも必ずこの hasPermission() を通す。

import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import type { Staff } from "@/lib/data/types";
import type { Session } from "@/lib/auth/session";

export type PermissionKey =
  | "ai_shimon_logs"
  | "ai_shimon_training"
  | "mcp_read"
  | "wiki_edit"
  | "cash_input"
  | "order_manage"
  | "recruit"
  | "instagram_team";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  note: string;
  ownerOnly?: boolean;
}

export const PERMISSION_DEFS: PermissionDef[] = [
  {
    key: "ai_shimon_logs",
    label: "AIしもんの相談を見られる",
    note: "スタッフ全員のAIしもんの相談とAIの返事を、人ごと・日付ごとに見られます（代表だけ）",
    ownerOnly: true,
  },
  {
    key: "ai_shimon_training",
    label: "AIしもんを教育できる",
    note: "AIしもんの考え方・知識（教育の項目）を足したり直したりできます（代表だけ）",
    ownerOnly: true,
  },
  {
    key: "mcp_read",
    label: "Claudeからアプリのデータを読める",
    note: "代表のClaude（カスタムコネクタ）から、売上・練習時間などを読み取れます（代表だけ・読むだけ）",
    ownerOnly: true,
  },
  { key: "wiki_edit", label: "ENi Wikipediaを編集できる", note: "幹部・管理者でなくても、Wikiのページを作成・編集できます" },
  { key: "cash_input", label: "レジ締めを入力できる", note: "幹部（店長・副店長）でなくても、レジ締め・現金の出し入れを入力できます" },
  { key: "order_manage", label: "発注の担当", note: "発注が必要な商品のリストの通知が届き、発注・入荷を記録できます" },
  { key: "recruit", label: "採用・面接の管理", note: "応募者の登録・面接の予定を作れます（面接官に選ばれた人は、その応募者だけ見られます）" },
  { key: "instagram_team", label: "全員のInstagramの数字を見る", note: "幹部・管理者でなくても、全員のInstagramの一覧を見られます" },
];

export function permissionDef(key: string): PermissionDef | undefined {
  return PERMISSION_DEFS.find((d) => d.key === key);
}

/** 付いている権限（DBが準備前なら空） */
export async function listGrantedPermissions(staffId: string): Promise<PermissionKey[]> {
  const rows = await fx().staffPermissions.list({ where: { staffId } });
  return rows.map((r) => r.permission as PermissionKey);
}

/**
 * 代表だけの権限は、まだ誰にも付けていない間（schema.sql を流した直後・DBの準備前）は代表が持っている扱いにする
 * （これまでの「代表だけが相談を読める」をそのまま続けるため）。
 */
async function ownerOnlyBootstrap(key: PermissionKey): Promise<boolean> {
  return (await fx().staffPermissions.count({ permission: key })) === 0;
}

/** その人がその権限を持っているか（在籍中に限る） */
export async function staffHasPermission(staff: Staff | null, key: PermissionKey): Promise<boolean> {
  if (!staff || !staff.isActive) return false;
  const def = permissionDef(key);
  if (!def) return false;
  if (def.ownerOnly && !staff.isOwner) return false;
  const granted = await fx().staffPermissions.count({ staffId: staff.id, permission: key });
  if (granted > 0) return true;
  if (def.ownerOnly) return ownerOnlyBootstrap(key);
  return false;
}

/** ログイン中の人がその権限を持っているか */
export async function hasPermission(session: Session | null, key: PermissionKey): Promise<boolean> {
  if (!session) return false;
  const me = await getDataStore().getStaff(session.staffId);
  return staffHasPermission(me, key);
}

/**
 * 権限を付け外しできるか。
 *  ・代表だけの権限：代表本人だけ（自分に付けるのも外すのも）
 *  ・そのほか：管理者
 */
export function canGrant(actor: Staff, key: PermissionKey, target: Staff): boolean {
  const def = permissionDef(key);
  if (!def) return false;
  if (def.ownerOnly) return actor.isOwner && actor.isActive && target.isOwner;
  return actor.role === "admin";
}

export async function setPermission(input: {
  actor: Staff;
  target: Staff;
  key: PermissionKey;
  granted: boolean;
}): Promise<boolean> {
  if (!canGrant(input.actor, input.key, input.target)) return false;
  const db = fx();
  if (input.granted) {
    await db.staffPermissions.upsert(
      { staffId: input.target.id, permission: input.key, grantedBy: input.actor.id },
      ["staffId", "permission"]
    );
  } else {
    await db.staffPermissions.removeWhere({ staffId: input.target.id, permission: input.key });
  }
  return true;
}
