// シフトのカレンダーと「休みの数で作る」
//  ・お店の休み（定休日・特別休暇）と、1人が自分で取る休みの数（月の休みの数 − 休みの数に入れるお店の休み）
//  ・希望休を出していない人も含めて全員に、足りない休みを自動で入れる（2027年1月のシフト案と同じ決まりで確かめる）
//  ・カレンダーの週の並び・赤字（行事・会議・メモ）・段数と出勤人数
import { describe, expect, it } from "vitest";
import { addDays, datesOfMonth, weekdayOf } from "@/lib/date";
import {
  buildCalendarDays,
  buildQuotaShift,
  calendarEvents,
  calendarWeeks,
  closureOn,
  displayNames,
  monthClosures,
  personalDaysOffTarget,
  quotaPersonOf,
  quotaRosterOf,
  summarizePeople,
  type Closure,
  type QuotaShiftInput,
} from "@/lib/shift/calendar";
import { generateForView } from "@/lib/shift/generate";
import { buildShiftMonthInputs } from "@/lib/shift/context";
import { loadMonthSchedule } from "@/lib/shift/load";
import { resolveShiftView } from "@/lib/shift/view";
import { getMockStore } from "@/lib/data/mock-store";
import type { CompanyEvent, Meeting, Staff, StoreCalendarDay } from "@/lib/data/types";
import type { OverrideDay } from "@/lib/shift/assign";

const JAN = "2027-01";
const ENI = { id: "eni", closedWeekdays: [1], monthlyDaysOff: 8 };
const specialDays: StoreCalendarDay[] = ["2027-01-01", "2027-01-02", "2027-01-03"].map((date) => ({
  storeId: "eni",
  date,
  dayStatus: "closed",
  closedLabel: "特別休暇",
  countsAsDayOff: false,
  note: "",
}));

function person(id: string, patch: Partial<Staff> = {}): Staff {
  return {
    id,
    storeId: "eni",
    name: id,
    loginId: id,
    role: "staff",
    jobType: "assistant",
    rank: "",
    isExecutive: false,
    isOwner: false,
    mission: "",
    tiers: 1,
    themeColor: "",
    fixedOvertimeHours: 20,
    isActive: true,
    managedStoreIds: [],
    nickname: "",
    ...patch,
  };
}

// 2027年1月のシフト案の12人（スタイリスト5人・アシスタント7人）
const STYLISTS = [
  person("しもん", { jobType: "stylist", tiers: 3, role: "admin" }),
  person("みらい", { jobType: "stylist", tiers: 3 }),
  person("としひろ", { jobType: "stylist", tiers: 3 }),
  person("たかひろ", { jobType: "stylist", tiers: 2 }),
  person("もか", { jobType: "stylist", tiers: 1 }),
];
const ASSISTANTS = ["ほたる", "まや", "そら", "くれは", "なな", "ゆうと", "けいしゅう"].map((n, i) =>
  person(n, { rank: i < 3 ? "final" : "first" })
);
const TEAM = [...STYLISTS, ...ASSISTANTS];

/** しもんさんの研修（19〜27日）・会議（28日）・10日の休み、ゆうとさんの10日（春高）は管理者が先に入れた */
function januaryOverrides(): Map<string, Map<string, OverrideDay>> {
  const map = new Map<string, Map<string, OverrideDay>>();
  const off = (id: string, date: string, note = "") => {
    if (!map.has(id)) map.set(id, new Map());
    map.get(id)!.set(date, { isWorking: false, startTime: "", endTime: "", note });
  };
  off("しもん", "2027-01-10");
  for (let d = 19; d <= 27; d++) off("しもん", `2027-01-${d}`, "経営者研修");
  off("しもん", "2027-01-28", "会議");
  off("ゆうと", "2027-01-10", "春高");
  return map;
}

function januaryInput(): QuotaShiftInput {
  const closures = new Map([["eni", monthClosures(ENI, specialDays, JAN)]]);
  return {
    month: JAN,
    people: TEAM.map((s) => quotaPersonOf(s, "eni")),
    closures,
    targetByStore: new Map([["eni", personalDaysOffTarget(ENI, closures.get("eni")!)!]]),
    prefs: new Map([
      ["たかひろ", new Map([["2027-01-06", "off" as const]])],
      ["もか", new Map([["2027-01-08", "off" as const]])],
    ]),
    patterns: new Map(),
    overrides: januaryOverrides(),
    // 全体MT（17日）は全員参加。幹部MT（8日）・幹部しもん塾（14日）は幹部が参加
    allHandsDates: new Set(["2027-01-17"]),
    requiredByDate: new Map([
      ["2027-01-08", new Set(["しもん", "みらい", "としひろ", "たかひろ"])],
      ["2027-01-14", new Set(["しもん", "みらい", "としひろ"])],
    ]),
    maxConsecutiveDays: 6,
    prevWorked: new Map(),
  };
}

describe("お店の休みと、1人が自分で取る休みの数", () => {
  it("定休日の曜日は休み。日ごとの設定（特別休暇・この日は営業）が優先", () => {
    expect(closureOn(ENI, undefined, "2027-01-04")).toEqual({ label: "定休日", counts: true });
    expect(closureOn(ENI, undefined, "2027-01-05")).toBeNull();
    expect(closureOn(ENI, specialDays[0], "2027-01-01")).toEqual({ label: "特別休暇", counts: false });
    const open: StoreCalendarDay = { ...specialDays[0], date: "2027-01-11", dayStatus: "open", closedLabel: "" };
    expect(closureOn(ENI, open, "2027-01-11")).toBeNull();
  });

  it("月曜定休4日を含めて8休 → 各自4日。特別休暇（1〜3日）は数えない", () => {
    const closures = monthClosures(ENI, specialDays, JAN);
    expect([...closures.keys()].sort()).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
      "2027-01-11",
      "2027-01-18",
      "2027-01-25",
    ]);
    expect(personalDaysOffTarget(ENI, closures)).toBe(4);
    // 月曜が5回ある月は、各自3日
    expect(personalDaysOffTarget(ENI, monthClosures(ENI, [], "2027-03"))).toBe(3);
    // 月の休みの数を決めていない店舗は、休みの数で作らない
    expect(personalDaysOffTarget({ monthlyDaysOff: 0 }, closures)).toBeNull();
  });
});

describe("休みの数で作る（2027年1月のシフト案と同じ決まり）", () => {
  const input = januaryInput();
  const { assignments, plan } = buildQuotaShift(input);
  const closures = input.closures.get("eni")!;
  const openDates = datesOfMonth(JAN).filter((d) => !closures.has(d));

  it("希望休を出していない人も含めて、全員が4日（しもんさんは研修・会議で多いので足さない）", () => {
    for (const s of TEAM) {
      const off = plan.off.get(s.id)!;
      if (s.id === "しもん") {
        // 10日・19〜28日（25日は定休日なので数えない）
        expect(off.size).toBe(10);
        expect(plan.auto.get(s.id)!.size).toBe(0);
      } else {
        expect(off.size, s.id).toBe(4);
      }
    }
    // ゆうとさんは春高（10日）を入れて残り3日、たかひろさん・もかさんは希望休を入れて残り3日
    expect(plan.auto.get("ゆうと")!.size).toBe(3);
    expect(plan.auto.get("たかひろ")!.size).toBe(3);
    expect(plan.shortfall.size).toBe(0);
  });

  it("自動の休みは、お店の休み・全員参加の日・自分が出る会議の日に入れない。土日もなるべく避ける", () => {
    const weekend: string[] = [];
    for (const s of TEAM) {
      for (const d of plan.auto.get(s.id)!) {
        expect(closures.has(d), `${s.id} ${d}`).toBe(false);
        expect(d).not.toBe("2027-01-17");
        expect(input.requiredByDate.get(d)?.has(s.id) ?? false, `${s.id} ${d}`).toBe(false);
        if ([0, 6].includes(weekdayOf(d))) weekend.push(s.id);
      }
    }
    // 土日になるのは、3段のスタイリストで、ほかの3段と重ならない平日が足りないときだけ
    // （しもんさんの研修・会議の日と、幹部MT・しもん塾の日を避けると、平日が足りなくなる）
    for (const id of weekend) expect(STYLISTS.find((s) => s.id === id)?.tiers).toBe(3);
    expect(weekend.length).toBeLessThanOrEqual(1);
  });

  it("3段のスタイリスト同士は、自動の休みを同じ日にしない（しもんさんの研修の日も避ける）", () => {
    const top = STYLISTS.filter((s) => s.tiers >= 3).map((s) => s.id);
    for (const d of openDates) {
      const offTop = top.filter((id) => plan.off.get(id)!.has(d));
      const autoTop = top.filter((id) => plan.auto.get(id)!.has(d));
      if (autoTop.length > 0) expect(offTop.length, d).toBe(1);
    }
  });

  it("休みを週ごとに散らす（自動の休みは同じ週に2日まで）", () => {
    for (const s of TEAM) {
      const weeks = new Map<string, number>();
      for (const d of plan.off.get(s.id)!) {
        const wk = addDays(d, -((weekdayOf(d) + 6) % 7));
        weeks.set(wk, (weeks.get(wk) ?? 0) + (plan.auto.get(s.id)!.has(d) ? 1 : 0));
      }
      for (const n of weeks.values()) expect(n).toBeLessThanOrEqual(2);
    }
  });

  it("休み以外の営業日は全員出勤。お店の休みの日は誰も入れない", () => {
    for (const d of datesOfMonth(JAN)) {
      const todays = assignments.filter((a) => a.date === d);
      if (closures.has(d)) {
        expect(todays.length, d).toBe(0);
        continue;
      }
      const expected = TEAM.filter((s) => !plan.off.get(s.id)!.has(d)).map((s) => s.id).sort();
      expect(todays.map((a) => a.staffId).sort(), d).toEqual(expected);
    }
    // 全員参加の日（全体MT）は12人全員
    expect(assignments.filter((a) => a.date === "2027-01-17")).toHaveLength(12);
  });
});

describe("対象の人・名前", () => {
  it("職種のない管理者で、希望休も基本パターンも無い人は入れない（管理用のアカウント）", () => {
    const admin = person("管理", { role: "admin", jobType: "" });
    const roster = quotaRosterOf([...TEAM, admin], new Set());
    expect(roster.map((s) => s.id)).not.toContain("管理");
    expect(roster.map((s) => s.id)).toContain("しもん"); // 管理者でもスタイリストなら入る
    expect(quotaRosterOf([admin], new Set(["管理"])).map((s) => s.id)).toEqual(["管理"]);
  });

  it("カレンダーの名前は呼び名 ＞ 名字", () => {
    const names = displayNames([
      { id: "a", name: "松本 尚大", nickname: "たかひろ" },
      { id: "b", name: "高橋 未来", nickname: "" },
      { id: "c", name: "岸京秀", nickname: " " },
    ]);
    expect(names.get("a")).toBe("たかひろ");
    expect(names.get("b")).toBe("高橋");
    expect(names.get("c")).toBe("岸京秀");
  });
});

describe("カレンダーの表示", () => {
  it("月曜はじまりで並べる（2027年1月は金曜はじまり・5週）", () => {
    const weeks = calendarWeeks(JAN, datesOfMonth(JAN).map((date) => ({ date })));
    expect(weeks).toHaveLength(5);
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]?.date).toBe("2027-01-01");
    expect(weeks[4][6]?.date).toBe("2027-01-31");
  });

  it("赤字：店舗のメモ → 会社のイベント → 会議（1on1は出さない）", () => {
    const meeting = (date: string, committee: string, meetingType: Meeting["meetingType"] = "other") =>
      ({ meetingDate: date, committee, title: "", meetingType }) as Meeting;
    const events = calendarEvents({
      month: JAN,
      storeDays: [{ ...specialDays[0], date: "2027-01-04", dayStatus: "", note: "ENi初詣（昼から）" }],
      companyEvents: [
        { startDate: "2027-01-19", endDate: "2027-01-20", startTime: "", title: "経営者研修", required: false } as CompanyEvent,
      ],
      meetings: [meeting("2027-01-08", "exec"), meeting("2027-01-17", "", "all"), meeting("2027-01-12", "", "1on1")],
      committeeNames: new Map([["exec", "幹部MT"]]),
    });
    expect(events.get("2027-01-04")).toEqual(["ENi初詣（昼から）"]);
    expect(events.get("2027-01-19")).toEqual(["経営者研修"]);
    expect(events.get("2027-01-20")).toEqual(["経営者研修"]);
    expect(events.get("2027-01-08")).toEqual(["幹部MT"]);
    expect(events.get("2027-01-17")).toEqual(["全体ミーティング"]);
    expect(events.has("2027-01-12")).toBe(false);
  });

  it("段数の合計は出勤するスタイリストの段数。出勤人数との差も出す", () => {
    const input = januaryInput();
    const { plan } = buildQuotaShift(input);
    const closures: Map<string, Closure> = input.closures.get("eni")!;
    const people = TEAM.map((s) => ({ id: s.id, name: s.id, jobType: s.jobType, tiers: s.tiers }));
    const days = buildCalendarDays({
      month: JAN,
      people,
      closures,
      events: new Map(),
      dayOf: (id, d) =>
        closures.has(d) || plan.off.get(id)!.has(d)
          ? { working: false, kind: plan.auto.get(id)!.has(d) ? "auto" : "admin" }
          : { working: true },
    });
    const allHands = days.find((d) => d.date === "2027-01-17")!;
    expect(allHands.counts).toEqual({ headcount: 12, tiers: 12, stylists: 5, assistants: 7, diff: 0 });
    const monday = days.find((d) => d.date === "2027-01-04")!;
    expect(monday.closure?.label).toBe("定休日");
    expect(monday.off).toEqual([]);
    expect(monday.counts).toBeNull();
    // 内訳：定休日4日（特別休暇は数えない）＋自分の休み4日＝8休
    const summary = summarizePeople(people, days).find((p) => p.staffId === "まや")!;
    expect(summary.closures).toBe(4);
    expect(summary.total).toBe(8);
  });
});

describe("デモのデータで：ENi（月曜定休・8休）は希望休を出していない人も含めて休みの数で作る", () => {
  it("ENi の4人それぞれに、定休日のほか自分の休みが入る（定休日を含めて8休）", async () => {
    const db = getMockStore();
    const month = "2030-04"; // デモのシフト表・希望休と重ならない月
    const loaded = await loadMonthSchedule(db, month, true);
    const view = resolveShiftView({
      stores: loaded.stores,
      activeStaff: loaded.activeStaff,
      schedule: loaded.schedule,
      storeParam: undefined,
      brandLabel: "ENi",
      chosenStores: loaded.chosenStores,
    });
    const inputs = await buildShiftMonthInputs(db, month);
    const generated = generateForView(inputs, view);
    expect(generated.quotaStaffIds.sort()).toEqual(["staff-3", "staff-4", "staff-5", "staff-6"]);
    const open = datesOfMonth(month).filter((d) => weekdayOf(d) !== 1);
    // 2030年4月は月曜が5回あるので、8休のうち定休日が5日・各自3日
    expect(datesOfMonth(month).length - open.length).toBe(5);
    for (const id of generated.quotaStaffIds) {
      const working = new Set(generated.assignments.filter((a) => a.staffId === id).map((a) => a.date));
      expect(open.filter((d) => !working.has(d)).length, id).toBe(3);
      expect([...working].some((d) => weekdayOf(d) === 1)).toBe(false);
    }
  });
});

describe("カレンダーの読み込み（管理者が入れた休み → 自動で作る → 表示）", () => {
  it("入れた休み（休みの中身つき）は自動で作り直しても残り、ほかの休みは自動で入る", async () => {
    const { loadCalendarContext } = await import("@/lib/shift/calendar-load");
    const db = getMockStore();
    const month = "2030-07"; // 月曜が5回（1・8・15・22・29日）→ 各自3日
    const training = ["2030-07-02", "2030-07-03"];
    for (const date of training) {
      await db.upsertScheduleOverride({ staffId: "staff-3", date, isWorking: false, startTime: "", endTime: "", note: "研修" });
    }
    // 作る前：入れた休みは「管理者」、ほかの人は休みの決まっていない日を出勤として数える
    let ctx = await loadCalendarContext(db, month, undefined, "ENi");
    expect(ctx.store.name).toBe("ENi 自由が丘店");
    expect(ctx.quotaMode).toBe(true);
    expect(ctx.target).toBe(3);
    expect(ctx.status).toBe("none");
    expect(ctx.dayOf("staff-3", "2030-07-02")).toEqual({ working: false, kind: "admin", reason: "研修" });
    expect(ctx.dayOf("staff-5", "2030-07-02")).toEqual({ working: true });
    expect(ctx.dayOf("staff-5", "2030-07-01")).toEqual({ working: false }); // 定休日

    // 自動で作る（下書き）
    const generated = generateForView(ctx.inputs, ctx.view);
    await db.replaceMonthAssignments(month, generated.assignments, { staffIds: [...ctx.view.memberIds] });
    ctx = await loadCalendarContext(db, month, undefined, "ENi");
    expect(ctx.status).toBe("draft");
    expect(ctx.dayOf("staff-3", "2030-07-02")).toEqual({ working: false, kind: "admin", reason: "研修" });

    const people = ctx.people.map((s) => ({ id: s.id, name: ctx.names.get(s.id)!, jobType: s.jobType, tiers: s.tiers }));
    const days = buildCalendarDays({ month, people, closures: ctx.closures, events: new Map(), dayOf: ctx.dayOf });
    const summaries = summarizePeople(people, days);
    for (const s of summaries) {
      // 定休日5日＋各自3日＝8休。山本さん（staff-3）は研修2日＋自動1日
      expect(s.total, s.name).toBe(8);
      expect(s.closures).toBe(5);
    }
    const yamamoto = summaries.find((s) => s.staffId === "staff-3")!;
    expect(yamamoto.admin).toBe(2);
    expect(yamamoto.auto).toBe(1);
    // カレンダーに出す名前は呼び名
    expect(summaries.map((s) => s.name).sort()).toEqual(["あおい", "だいき", "ひかり", "ゆいな"]);
  });
});
