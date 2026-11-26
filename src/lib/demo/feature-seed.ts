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

async function seedAiAndWiki(put: DemoPut) {
  put(t.aiTrainings, [
    {
      kind: "philosophy",
      title: "失敗したとき",
      body: "失敗した話を聞いたら、まず「話してくれてありがとう」と受け止める。責めずに、次の一歩を一緒に1つだけ決める。",
      isActive: true,
      sortOrder: 10,
      createdBy: "staff-admin",
      updatedBy: "staff-admin",
    },
    {
      kind: "ng",
      title: "",
      body: "「普通は」「みんなできてる」と比べる言い方はしない。",
      isActive: true,
      sortOrder: 10,
      createdBy: "staff-admin",
      updatedBy: "staff-admin",
    },
  ]);
  put(t.wikiPages, [
    {
      title: "遅刻・欠勤の連絡のしかた",
      category: "就業ルール",
      visibility: "all",
      body: "# 遅刻・欠勤の連絡\n\n1. 分かった時点で、すぐに店長へ電話する（LINEだけで済ませない）\n2. 出られる時間の目安を伝える\n3. 当日の予約のお客様の対応は、店長と一緒に決める\n\n**開店30分前まで**に連絡がない場合は、店長から本人に電話します。",
      createdBy: "staff-admin",
      updatedBy: "staff-admin",
    },
    {
      title: "シャンプーの基本の流れ",
      category: "技術",
      visibility: "all",
      body: "## 流れ\n\n- お湯の温度をお客様の手首で確かめる\n- 生え際から後ろへ、指の腹で洗う\n- すすぎは2回。耳の後ろの流し残しに気をつける\n\n| 工程 | 目安の時間 |\n| --- | --- |\n| 予洗い | 1分 |\n| シャンプー | 3分 |\n| すすぎ | 2分 |",
      createdBy: "staff-admin",
      updatedBy: "staff-admin",
    },
    {
      title: "店長会議の進め方（幹部用）",
      category: "店舗運営",
      visibility: "exec",
      body: "幹部だけが見られるページの例です。数字の振り返り → 来月の重点 → 決めたことの担当と期限、の順で進めます。",
      createdBy: "staff-admin",
      updatedBy: "staff-admin",
    },
  ]);
}

async function seedShift(put: DemoPut, today: string) {
  // 締切後の希望休（承認待ち）と、打刻の修正の申請（承認待ち）。店長（山本さん・daiki）か管理者で承認できる
  put(t.dayoffLateRequests, [
    { staffId: "staff-5", date: addDays(today, 12), reason: "親戚の結婚式が決まった", paidLeave: true, status: "pending", createdAt: at(addDays(today, -1), 21) },
  ]);
  put(t.attendanceCorrections, [
    { staffId: "staff-6", date: addDays(today, -1), punchType: "out", time: "18:40", reason: "退勤の打刻を忘れました", status: "pending", createdAt: at(today, 9) },
  ]);
  // 1日ごとの必要人数（ENi：土日は4人）
  put(t.shiftStaffingRules, [
    { storeId: ENI, weekday: 6, date: "", required: 4 },
    { storeId: ENI, weekday: 0, date: "", required: 4 },
  ]);
}

async function seedCash(put: DemoPut, today: string) {
  // ENi 自由が丘店の、きのうまでの3日分のレジ締め（1日は差額あり・確認済み）
  const days = [3, 2, 1].map((n) => addDays(today, -n));
  put(
    t.registerClosings,
    days.map((date, i) => {
      const cashSales = [42000, 38500, 51200][i];
      const diff = i === 1 ? -100 : 0;
      const counted = 30000 + cashSales + diff - (i === 2 ? 1200 : 0);
      return {
        storeId: ENI,
        date,
        changeFund: 30000,
        cashSales,
        denominations: { "10000": Math.floor(counted / 10000), "1000": Math.floor((counted % 10000) / 1000), "100": Math.floor((counted % 1000) / 100) },
        countedTotal: counted,
        expectedTotal: counted - diff,
        diff,
        diffReason: diff ? "お釣りの渡し間違い（100円多く渡した）" : "",
        salesSource: "manual" as const,
        closedBy: "staff-3",
        closedAt: at(date, 19, 10),
        confirmedBy: i < 2 ? "staff-admin" : null,
        confirmedAt: i < 2 ? at(date, 20) : null,
      };
    })
  );
  put(t.cashMovements, [
    { storeId: ENI, date: days[2], kind: "expense", direction: "out" as const, description: "タオルの洗剤", amount: 1200, createdBy: "staff-3" },
  ]);
}

registerDemoSeeder(async (put: DemoPut) => {
  await seedCash(put, todayJst());
  const today = todayJst();
  await seedSns(put, today);
  await seedAiAndWiki(put);
  await seedShift(put, today);
});
