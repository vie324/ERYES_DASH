// デモモード（Supabase未設定）で、追加機能（依頼10〜23）を触って確かめられるようにするための見本のデータ。
// 起動のたびに入り直す（本番では使われない）。機能ごとに seedXxx に分けて足していく。

import { registerDemoSeeder, type DemoPut } from "@/lib/data/collections";

registerDemoSeeder(async (put: DemoPut) => {
  void put;
});
