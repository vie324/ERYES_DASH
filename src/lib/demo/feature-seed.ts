// デモモード（Supabase未設定）で、追加機能（依頼10〜23）を触って確かめられるようにするための見本のデータ。
// 起動のたびに入り直す（本番では使われない）。スタッフ・店舗は lib/data/mock-store.ts のデモデータ
// （staff-admin・staff-1〜6・staff-manager／store-1〜4）に合わせている。機能ごとに seedXxx に分けた。

import { registerDemoSeeder, type DemoPut } from "@/lib/data/collections";
import * as t from "@/lib/data/tables";
import { addDays, addMonths, jstDayBoundsUtc, thisMonthJst, todayJst } from "@/lib/date";

/** 日本時間のその日の h 時 */
function at(date: string, h: number, m = 0): Date {
  return new Date(jstDayBoundsUtc(date).start.getTime() + (h * 60 + m) * 60_000);
}

const ENI = "store-4";

async function seedSns(put: DemoPut, today: string) {
  const prev = addMonths(thisMonthJst(), -1);
  put(t.snsPosts, [
    {
      kind: "case",
      authorStaffId: "staff-3",
      storeId: ENI,
      category: "接客",
      body: "ご新規のお客様に、仕上げの前にスタイリングの仕方を一緒に練習しました。「家でも同じようにできそう！」と喜んでいただけて、次回のご予約もいただけました。",
      createdAt: at(addDays(today, -1), 19),
      pinnedAt: at(addDays(today, -1), 20),
      pinnedBy: "staff-admin",
    },
    {
      kind: "case",
      authorStaffId: "staff-1",
      storeId: "store-1",
      category: "チームワーク",
      body: "予約が重なった時間帯、表参道店のスタッフが応援に来てくれて、お待たせせずにご案内できました。",
      createdAt: at(addDays(today, -2), 18),
    },
  ]);
  // 前月のサンクス（月間表彰の候補が出るように。取り込んだ昔のカードとして入れる）
  put(
    t.thanksExtras,
    [
      ["staff-4", "staff-5", "シャンプーの回し方が上手になって助かっています！"],
      ["staff-3", "staff-5", "練習の後片付け、いつもありがとう"],
      ["staff-6", "staff-5", "朝の準備を全部やってくれていて感動しました"],
      ["staff-5", "staff-4", "カットの練習を見てくれてありがとうございます"],
      ["staff-3", "staff-4", "新人さんへの声かけ、さすがです"],
      ["staff-1", "staff-2", "急なシフト交代、本当に助かりました"],
    ].map(([from, to, body], i) => ({
      thanksId: null,
      fromStaffId: from,
      toStaffId: to,
      body,
      cardColor: ["gold", "rose", "sky", "mint"][i % 4],
      points: [10, 5, 20, 10, 5, 0][i],
      originalDate: `${prev}-${String(3 + i * 4).padStart(2, "0")}`,
      source: "import" as const,
    }))
  );
}

registerDemoSeeder(async (put: DemoPut) => {
  const today = todayJst();
  await seedSns(put, today);
});
