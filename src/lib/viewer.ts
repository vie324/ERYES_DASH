// ログイン中の人の役割をまとめて判定する（依頼10〜23の画面・サーバーの処理で共通）。
// ロールの呼び名は CLAUDE.md に合わせる：管理者（admin）／幹部（is_executive。管理者も含む）／
// 店舗の管理者（manager＋担当店舗。岡さんなど）／代表（is_owner）。名前では判定しない。

import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireSession, type Session } from "@/lib/auth/session";
import { getBrand, type Brand } from "@/lib/brand";
import type { Staff, Store } from "@/lib/data/types";

export interface Viewer {
  session: Session;
  me: Staff | null;
  staffId: string;
  isAdmin: boolean;
  /** 幹部（店長・副店長）か管理者 */
  isExec: boolean;
  /** 店舗の管理者（担当店舗だけを見る管理者） */
  isStoreManager: boolean;
  isOwner: boolean;
  /** 管理者なら全店舗、店舗の管理者なら担当店舗、幹部なら自分の店舗 */
  storeScope: string[] | "all";
  brand: Brand;
}

export async function viewerOf(session: Session): Promise<Viewer> {
  const me = await getDataStore().getStaff(session.staffId);
  const isAdmin = session.role === "admin";
  const isStoreManager = session.role === "manager" && (me?.managedStoreIds.length ?? 0) > 0;
  const isExec = isAdmin || Boolean(me?.isExecutive);
  const storeScope: Viewer["storeScope"] = isAdmin
    ? "all"
    : isStoreManager
      ? [...new Set([...(me?.managedStoreIds ?? []), ...(me?.storeId ? [me.storeId] : [])])]
      : me?.storeId
        ? [me.storeId]
        : [];
  return {
    session,
    me,
    staffId: session.staffId,
    isAdmin,
    isExec,
    isStoreManager,
    isOwner: Boolean(me?.isActive && me.isOwner),
    storeScope,
    brand: (await getBrand()) ?? "eni",
  };
}

/** ログイン必須（未ログインは /login へ） */
export async function requireViewer(): Promise<Viewer> {
  return viewerOf(await requireSession());
}

/** 幹部・管理者・店舗の管理者だけ（それ以外はホームへ戻す） */
export async function requireManagerLike(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff");
  return v;
}

/** その店舗を見られるか（管理者は全店舗・店舗の管理者は担当店舗・幹部は自分の店舗） */
export function canSeeStore(v: Viewer, storeId: string | null | undefined): boolean {
  if (!storeId) return v.isAdmin;
  return v.storeScope === "all" || v.storeScope.includes(storeId);
}

/** 見られる店舗だけに絞る */
export function scopedStores(v: Viewer, stores: Store[]): Store[] {
  return v.storeScope === "all" ? stores : stores.filter((s) => (v.storeScope as string[]).includes(s.id));
}

/** その人を「担当メンバー」として見られるか（同じ店舗の幹部・担当店舗の店舗の管理者・管理者） */
export function canSeeMember(v: Viewer, member: Staff): boolean {
  if (v.isAdmin) return true;
  if (member.id === v.staffId) return true;
  if (v.isStoreManager && v.me?.managedStoreIds.includes(member.storeId)) return true;
  return v.isExec && v.me?.storeId === member.storeId;
}

/** イーリス（EREYS）の店舗か（店舗名で見分ける。今のシフト・日報と同じ決まり） */
export function isEyesStore(store: Pick<Store, "name"> | undefined | null): boolean {
  return Boolean(store && /EREYS|イーリス/i.test(store.name));
}
