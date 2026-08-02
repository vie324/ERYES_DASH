// 業態（ブランド）の選択：ログイン後に ENi（ヘアサロン／メインブランド）か EREYS（アイサロン）を選び、
// その選択に応じてスタッフ・管理者のメニュー（項目）を切り替える。
// 選択はCookieに保存し、ヘッダーの切替チップからいつでも変更できる。
// ロゴのマークは両ブランド共通で、ワードマーク（文字）だけが違う。

import { cookies } from "next/headers";

export type Brand = "eyes" | "eni";
export const BRAND_COOKIE = "eryes_brand";

export const BRAND_INFO: Record<Brand, { label: string; sub: string }> = {
  eni: { label: "ENi", sub: "ヘアサロン（メインブランド）" },
  eyes: { label: "EREYS", sub: "アイラッシュ・アイブロウ" },
};

/** 選択肢の並び。メインブランドのENiを先頭にする */
export const BRAND_ORDER: Brand[] = ["eni", "eyes"];

export function isBrand(v: unknown): v is Brand {
  return v === "eyes" || v === "eni";
}

/** 現在選択中のブランド（未選択なら null） */
export async function getBrand(): Promise<Brand | null> {
  const v = (await cookies()).get(BRAND_COOKIE)?.value;
  return isBrand(v) ? v : null;
}

/** ブランドを保存（サーバーアクション／ルートハンドラ内でのみ呼ぶ） */
export async function setBrandCookie(brand: Brand): Promise<void> {
  (await cookies()).set(BRAND_COOKIE, brand, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

/** ブランドの選択を消す（ログアウト時など） */
export async function clearBrandCookie(): Promise<void> {
  (await cookies()).delete(BRAND_COOKIE);
}
