// 使い方ガイドの入口。業態（ENi / EREYS）× 役割（スタッフ / 管理者）で中身を出し分ける。
//
// 以前は1つの文章を両業態で使い回していて、ENiの人にアイサロンの手順（GPS打刻・レジ締め）が
// 出てしまっていた。業態ごとにファイルを分け、ここで選ぶだけにしている。

import type { Brand } from "@/lib/brand";
import { ENI_ADMIN_GUIDE, ENI_STAFF_GUIDE } from "@/lib/help/eni";
import { EYES_ADMIN_GUIDE, EYES_STAFF_GUIDE } from "@/lib/help/eyes";
import type { HelpGuide } from "@/lib/help/types";

export type { HelpGuide } from "@/lib/help/types";

export function getHelpGuide(brand: Brand, role: "admin" | "staff"): HelpGuide {
  if (brand === "eni") return role === "admin" ? ENI_ADMIN_GUIDE : ENI_STAFF_GUIDE;
  return role === "admin" ? EYES_ADMIN_GUIDE : EYES_STAFF_GUIDE;
}
