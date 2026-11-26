// 依頼10：社内SNS・サンクス・月間サンクス表彰
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { addMonths, thisMonthJst, todayJst } from "@/lib/date";
import { buildTimeline, canSeeThanks, listThanks, matchStaffByName, normalizeDate, parseThanksCsv } from "@/lib/sns";
import { announceAward, countAwardCandidates, ensureAward } from "@/lib/sns/award";

describe("サンクス（今のサンクスカードのデータをそのまま使う）", () => {
  it("今のサンクスカード（thanks_posts）が、そのままサンクスとして出る", async () => {
    const db = getMockStore();
    const list = await listThanks(db, {});
    expect(list.some((t) => t.id === "thanks-1" && t.kind === "app")).toBe(true);
  });

  it("非公開のサンクスは、送った人・もらった人・管理者だけが見られる", () => {
    const t = { isPrivate: true, fromStaffId: "a", toStaffId: "b" };
    expect(canSeeThanks(t, "a", false)).toBe(true);
    expect(canSeeThanks(t, "b", false)).toBe(true);
    expect(canSeeThanks(t, "c", false)).toBe(false);
    expect(canSeeThanks(t, "c", true)).toBe(true);
  });

  it("非公開で送ったサンクスは、ほかの人のタイムラインに出ない", async () => {
    const db = getMockStore();
    const post = await db.createThanksPost({ fromStaffId: "staff-3", toStaffId: "staff-6", body: "ないしょのありがとう", cardColor: "gold" });
    await fx().thanksExtras.insert({ thanksId: post.id, fromStaffId: "staff-3", toStaffId: "staff-6", isPrivate: true, source: "app" });
    const other = await buildTimeline(db, { staffId: "staff-5", isAdmin: false }, { tab: "thanks" });
    expect(other.items.some((i) => i.id === post.id)).toBe(false);
    const receiver = await buildTimeline(db, { staffId: "staff-6", isAdmin: false }, { tab: "thanks" });
    expect(receiver.items.some((i) => i.id === post.id)).toBe(true);
  });
});

describe("昔のサンクスカードの取り込み（CSV）", () => {
  it("見出しの名前で列を探し、日付をそろえる", () => {
    const { rows, errors } = parseThanksCsv("日付,送った人,もらった人,メッセージ\n2026/3/5,山本 大輝,小林 蒼,\"いつも, ありがとう\"\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ date: "2026-03-05", from: "山本 大輝", to: "小林 蒼", body: "いつも, ありがとう" }]);
    expect(normalizeDate("2026年10月1日")).toBe("2026-10-01");
  });

  it("名前は空白を無視して照合し、同じ名前が2人いるときは当てない", () => {
    const staff = [
      { id: "1", name: "山本 大輝", nickname: "" },
      { id: "2", name: "田中 凛", nickname: "りん" },
      { id: "3", name: "田中 凛", nickname: "" },
    ];
    expect(matchStaffByName(staff, "山本大輝")?.id).toBe("1");
    expect(matchStaffByName(staff, "田中 凛")).toBeNull();
    expect(matchStaffByName(staff, "りん")?.id).toBe("2");
  });
});

describe("月間サンクス表彰", () => {
  it("前月分を、もらった数の多い順に候補として数える（取り込んだカードも数える）", async () => {
    const db = getMockStore();
    const prev = addMonths(thisMonthJst(), -1);
    const candidates = await countAwardCandidates(db, prev);
    // デモデータ：前月に staff-5 が3枚もらっている
    expect(candidates[0].staffId).toBe("staff-5");
    expect(candidates[0].received).toBe(3);
  });

  it("発表すると、表彰の投稿がタイムラインに出て、発表済みの月は数え直さない", async () => {
    const db = getMockStore();
    const prev = addMonths(thisMonthJst(), -1);
    await ensureAward(db, prev, { recount: true });
    const award = await announceAward(db, {
      month: prev,
      winners: [{ staffId: "staff-5", title: "月間サンクス賞", comment: "みんなを支えてくれました" }],
      message: "おめでとう！",
      announcedBy: "staff-admin",
    });
    expect(award.status).toBe("announced");
    const timeline = await buildTimeline(db, { staffId: "staff-1", isAdmin: false }, { tab: "awards" });
    expect(timeline.items.some((i) => i.type === "post" && i.post.kind === "award")).toBe(true);
    const again = await ensureAward(db, prev, { recount: true });
    expect(again.status).toBe("announced");
    // 全員にお知らせ（開くまで消えない）
    expect(await db.countUnreadAppNotifications("staff-1")).toBeGreaterThan(0);
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
