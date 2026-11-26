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

async function seedOrders(put: DemoPut, today: string) {
  const [beauty, wigShop] = put(t.suppliers, [
    { name: "ビューティーサプライ（デモ）", orderUrl: "https://example.com/order", contact: "担当 佐々木・03-0000-0000", method: "Web", deadlineNote: "毎週火曜12時", leadDays: 3, sortOrder: 10 },
    { name: "ウィッグ専門店（デモ）", orderUrl: "https://example.com/wig", contact: "", method: "電話", deadlineNote: "", leadDays: 7, sortOrder: 20 },
  ]);
  const products = put(t.products, [
    { name: "ENi シャンプー 300ml", category: "retail", brand: "ENi", supplierId: beauty.id, unit: "本", retailPrice: 3300, staffPrice: 2310, costPrice: 1200, barcode: "4900000000011", reorderPoint: 5, reorderQty: 12, sortOrder: 10 },
    { name: "ENi トリートメント 250g", category: "retail", brand: "ENi", supplierId: beauty.id, unit: "本", retailPrice: 3850, staffPrice: 2695, costPrice: 1400, barcode: "4900000000028", reorderPoint: 4, reorderQty: 10, sortOrder: 20 },
    { name: "カラー剤 7レベル ブラウン", category: "material", brand: "デモカラー", supplierId: beauty.id, unit: "本", retailPrice: 0, staffPrice: 0, costPrice: 650, barcode: "", reorderPoint: 10, reorderQty: 24, sortOrder: 30 },
    { name: "カットウィッグ（レディース）", category: "wig", brand: "", supplierId: wigShop.id, unit: "体", retailPrice: 0, staffPrice: 4400, costPrice: 3000, barcode: "", reorderPoint: 2, reorderQty: 5, sortOrder: 40 },
    { name: "ヘアオイル 100ml", category: "staff_sale", brand: "ENi", supplierId: beauty.id, unit: "本", retailPrice: 2970, staffPrice: 2079, costPrice: 1000, barcode: "4900000000035", reorderPoint: 3, reorderQty: 6, sortOrder: 50 },
  ]);
  // はじめの在庫（入荷として入れる）と、減った分
  put(
    t.inventoryMovements,
    products.flatMap((p, i) => [
      { storeId: ENI, productId: p.id, kind: "receive" as const, quantity: [10, 8, 20, 3, 6][i], occurredOn: addDays(today, -20), refType: "demo", createdAt: at(addDays(today, -20), 10) },
      { storeId: ENI, productId: p.id, kind: (i === 2 ? "use" : "sale") as "use" | "sale", quantity: [6, 2, 12, 2, 1][i], occurredOn: addDays(today, -5), refType: "demo", createdAt: at(addDays(today, -5), 15) },
    ])
  );
  put(t.purchaseOrders, [
    { storeId: ENI, productId: products[1].id, supplierId: beauty.id, quantity: 10, status: "ordered" as const, orderedBy: "staff-3", orderedAt: at(addDays(today, -1), 11), createdAt: at(addDays(today, -1), 11) },
  ]);
  put(t.staffPurchases, [
    { staffId: "staff-5", storeId: ENI, productId: products[3].id, itemName: products[3].name, category: "wig" as const, quantity: 1, unitPrice: 4400, total: 4400, purchasedOn: addDays(today, -3), recordedBy: "staff-5" },
    { staffId: "staff-4", storeId: ENI, productId: products[0].id, itemName: products[0].name, category: "staff_sale" as const, quantity: 2, unitPrice: 2310, total: 4620, purchasedOn: addDays(today, -2), recordedBy: "staff-3" },
  ]);
}

async function seedGoals(put: DemoPut, today: string) {
  const month = today.slice(0, 7);
  const [vision] = put(t.goals, [
    { level: "company", periodType: "vision", periodKey: String(Number(today.slice(0, 4)) + 5), title: "5年で売上10億（仮。ENiから届き次第差し替え）", targetValue: 1000000000, unit: "円", createdBy: "staff-admin" },
    { level: "store", storeId: ENI, periodType: "kgi", periodKey: today.slice(0, 4), title: "自由が丘店：今期の売上 1億2千万", targetValue: 120000000, unit: "円", createdBy: "staff-admin" },
  ]);
  const [g1] = put(t.goals, [
    { level: "personal", staffId: "staff-5", storeId: ENI, periodType: "month", periodKey: month, title: "カットのテストに合格する", area: "技術", parentId: vision.id, createdBy: "staff-5" },
    { level: "personal", staffId: "staff-5", storeId: ENI, periodType: "year", periodKey: today.slice(0, 4), title: "来年の春にデビューする", area: "技術", createdBy: "staff-5" },
  ]);
  put(t.reflections, [
    { staffId: "staff-5", weekKey: addDays(today, -7 - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), done: "ワインディングを毎朝続けられた", notDone: "SNSの投稿ができなかった", next: "週2回は投稿する" },
  ]);
  void g1;
}

registerDemoSeeder(async (put: DemoPut) => {
  await seedGoals(put, todayJst());
  await seedOrders(put, todayJst());
  await seedCash(put, todayJst());
  const today = todayJst();
  await seedSns(put, today);
  await seedAiAndWiki(put);
  await seedShift(put, today);
});
