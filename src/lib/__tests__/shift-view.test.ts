// シフト希望の反映（ENiのシフト表で「提出 0 / 0人」になっていた件）
//  ・所属店舗がほかの店舗（EREYS）のままでも、希望休で「勤務できる店舗」に選んだ店舗（ENi）の表に出る
//  ・所属店舗のずれの目印（表示中の店舗に所属する人が0人／選んだので出している人）
//  ・「提出 ◯ / ◯人」の分母：基本パターンが無いお店でも、出していない人を数に入れる
import { describe, expect, it } from "vitest";
import { buildMonthSchedule, chosenStoresOf, staffForStores } from "@/lib/shift/month";
import { resolveShiftView } from "@/lib/shift/view";
import { requestTargets, type RequestStatus } from "@/lib/shift/requests";
import { loadMonthSchedule } from "@/lib/shift/load";
import { buildShiftMonthInputs } from "@/lib/shift/context";
import { getMockStore } from "@/lib/data/mock-store";
import type { Staff, Store } from "@/lib/data/types";

// デモのデータのシフト表（今月〜）と重ならない、先の月
const MONTH = "2030-02";

const store = (id: string, name: string): Store => ({
  id,
  name,
  address: "",
  lat: 35.6,
  lng: 139.6,
  gpsRadiusM: 100,
  attendanceEnabled: true,
});
const EREYS = store("s-eyes", "EREYS 自由が丘店");
const ENI = store("s-eni", "ENi 自由が丘店");
const STORES = [EREYS, ENI];

function person(id: string, patch: Partial<Staff> = {}): Staff {
  return {
    id,
    storeId: EREYS.id,
    name: id,
    loginId: id,
    role: "staff",
    jobType: "stylist",
    rank: "",
    isExecutive: false,
    isOwner: false,
    mission: "",
    tiers: 1,
    themeColor: "",
    fixedOvertimeHours: 20,
    isActive: true,
    managedStoreIds: [],
    ...patch,
  };
}

/** シフト表も基本パターンも無い月（本番のENiと同じ：基本パターンを使っていない） */
function emptyMonth(staff: Staff[]) {
  return buildMonthSchedule({
    month: MONTH,
    staff,
    patterns: [],
    dayoffs: [],
    overrides: [],
    assignments: [],
    showDraft: true,
  });
}

const submitted = (days = 0): RequestStatus => ({ submitted: true, updatedAt: null, days, paidDays: 0, note: "" });

describe("店舗の表に出す人：希望休で選んだ店舗", () => {
  it("所属店舗が EREYS のままの人は、ENi を選んでいなければ ENi の表に出ず、選べば出る", () => {
    const staff = [person("taka"), person("matsu"), person("sakura", { jobType: "" })];
    const schedule = emptyMonth(staff);
    expect(staffForStores(staff, schedule, [ENI.id], { includeIdle: true })).toEqual([]);

    const chosen = chosenStoresOf(
      [
        { staffId: "taka", storeId: ENI.id },
        { staffId: "matsu", storeId: ENI.id },
      ],
      STORES.map((s) => s.id)
    );
    const members = staffForStores(staff, schedule, [ENI.id], { includeIdle: true, chosenStores: chosen });
    expect(members.map((s) => s.id)).toEqual(["taka", "matsu"]);
    // EREYS の表には、所属している全員がこれまでどおり出る
    expect(staffForStores(staff, schedule, [EREYS.id], { includeIdle: true, chosenStores: chosen }).map((s) => s.id)).toEqual([
      "taka",
      "matsu",
      "sakura",
    ]);
  });

  it("スタッフ側の表（関わりのない人は出さない）でも、選んだ人は出る", () => {
    const staff = [person("me", { storeId: ENI.id }), person("taka")];
    const schedule = emptyMonth(staff);
    const chosen = chosenStoresOf([{ staffId: "taka", storeId: ENI.id }], STORES.map((s) => s.id));
    expect(staffForStores(staff, schedule, [ENI.id], { keepIds: ["me"] }).map((s) => s.id)).toEqual(["me"]);
    expect(staffForStores(staff, schedule, [ENI.id], { keepIds: ["me"], chosenStores: chosen }).map((s) => s.id)).toEqual([
      "me",
      "taka",
    ]);
  });

  it("いまは無い店舗を選んだ記録は数えない", () => {
    const chosen = chosenStoresOf(
      [
        { staffId: "taka", storeId: "deleted-store" },
        { staffId: "matsu", storeId: ENI.id },
      ],
      STORES.map((s) => s.id)
    );
    expect(chosen.has("taka")).toBe(false);
    expect([...(chosen.get("matsu") ?? [])]).toEqual([ENI.id]);
  });
});

describe("所属店舗のずれの目印", () => {
  it("ENi の店舗に所属する人が0人なら homeCount=0。希望休で ENi を選んだ人は chosenOnly に入る", () => {
    const staff = [person("taka"), person("oya"), person("admin", { role: "admin", jobType: "" })];
    const chosenStores = chosenStoresOf([{ staffId: "taka", storeId: ENI.id }], STORES.map((s) => s.id));
    const view = resolveShiftView({
      stores: STORES,
      activeStaff: staff,
      schedule: emptyMonth(staff),
      storeParam: undefined,
      brandLabel: "ENi",
      chosenStores,
    });
    expect(view.storeFilter).toEqual([ENI.id]);
    expect(view.homeCount).toBe(0);
    expect(view.members.map((s) => s.id)).toEqual(["taka"]);
    expect(view.chosenOnly.map((s) => s.id)).toEqual(["taka"]);
  });

  it("所属店舗を ENi に直せば、希望休を出していない人も表に出て、目印は消える", () => {
    const staff = [person("taka", { storeId: ENI.id }), person("oya", { storeId: ENI.id }), person("sakura", { jobType: "" })];
    const chosenStores = chosenStoresOf([{ staffId: "taka", storeId: ENI.id }], STORES.map((s) => s.id));
    const view = resolveShiftView({
      stores: STORES,
      activeStaff: staff,
      schedule: emptyMonth(staff),
      storeParam: undefined,
      brandLabel: "ENi",
      chosenStores,
    });
    expect(view.homeCount).toBe(2);
    expect(view.members.map((s) => s.id)).toEqual(["taka", "oya"]);
    expect(view.chosenOnly).toEqual([]);
  });
});

describe("「提出 ◯ / ◯人」の対象", () => {
  it("基本パターンが無くても、管理者以外は数に入る（出していない人が未提出として見える）", () => {
    const members = [person("taka"), person("oya"), person("matsu")];
    const statuses = new Map([["taka", submitted(2)]]);
    // 自動作成の対象（基本パターンのある人・出した人）は taka だけ
    const targets = requestTargets(members, new Set(["taka"]), statuses);
    expect(targets.map((s) => s.id)).toEqual(["taka", "oya", "matsu"]);
    expect(targets.filter((s) => statuses.get(s.id)?.submitted).length).toBe(1);
  });

  it("管理者は、希望休を出したか、シフトに入るときだけ数える", () => {
    const members = [
      person("naka", { role: "admin", jobType: "" }),
      person("oka", { role: "admin", jobType: "" }),
      person("chief", { role: "admin" }),
      person("manager", { role: "manager" }),
    ];
    const targets = requestTargets(members, new Set(["chief"]), new Map([["oka", submitted()]]));
    expect(targets.map((s) => s.id)).toEqual(["oka", "chief", "manager"]);
  });
});

describe("デモのデータで：所属店舗が EREYS のままの人が、ENi を選んで希望休を出す", () => {
  it("画面（自動作成の前提）と操作（公開・自動作成）の両方で、ENi の表に同じ人が並ぶ", async () => {
    const db = getMockStore();
    // 小林さん（ENi のアシスタント）の所属店舗を EREYS にしてしまった状態
    await db.updateStaff("staff-5", { storeId: "store-1" });
    const viewOf = async () => {
      const loaded = await loadMonthSchedule(db, MONTH, true);
      return {
        loaded,
        view: resolveShiftView({
          stores: loaded.stores,
          activeStaff: loaded.activeStaff,
          schedule: loaded.schedule,
          storeParam: undefined,
          brandLabel: "ENi",
          chosenStores: loaded.chosenStores,
        }),
      };
    };

    const before = await viewOf();
    expect(before.view.memberIds.has("staff-5")).toBe(false);

    await db.submitDayoffRequest({
      staffId: "staff-5",
      targetMonth: MONTH,
      note: "",
      days: [{ date: `${MONTH}-10`, reason: "通院", paidLeave: false }],
      storeIds: ["store-4"],
    });
    const after = await viewOf();
    expect(after.view.memberIds.has("staff-5")).toBe(true);
    expect(after.view.chosenOnly.map((s) => s.id)).toEqual(["staff-5"]);

    // 画面は buildShiftMonthInputs から、操作は loadMonthSchedule から作る。どちらも同じ人になる
    const inputs = await buildShiftMonthInputs(db, MONTH);
    expect([...(inputs.chosenStores.get("staff-5") ?? [])]).toEqual(["store-4"]);
    const pageView = resolveShiftView({
      stores: inputs.stores,
      activeStaff: inputs.activeStaff,
      schedule: after.loaded.schedule,
      storeParam: undefined,
      brandLabel: "ENi",
      chosenStores: inputs.chosenStores,
    });
    expect([...pageView.memberIds].sort()).toEqual([...after.view.memberIds].sort());
    // 出した人は、提出数にも入る
    const targets = requestTargets(pageView.members, new Set(inputs.staffIds), inputs.requestStatuses);
    expect(targets.some((s) => s.id === "staff-5" && inputs.requestStatuses.get(s.id)?.submitted)).toBe(true);
  });
});
