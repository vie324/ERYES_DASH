// 依頼16：業務の整理の反映
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { applyWorkRows, normalizeFrequency, parseWorkTable } from "@/lib/work-import";

const TABLE = [
  "業務,今の担当,前回の結論,来月からの担当,やり方,アプリに載せたいか,当てはめ先,頻度,期限",
  "口コミの返信,店長,毎日見る,店長,Googleの口コミに返信する,○,,毎日,",
  "ワゴンの補充,アシスタント,,小林 蒼,ワゴンのタオルを補充,○,ルーティン,毎週月・木,",
  "年末の大掃除の段取り,店長,,山本 大輝,業者に連絡,○,タスク,,2026/12/20",
  "電話の取り方,全員,,全員,マニュアルにする,○,Wiki,,",
  "予約の自動キャンセル待ち,店長,,,システムで自動にしたい,○,次の依頼,,",
  "紙の在庫表,店長,,,やめる,×,,,",
  "シャンプー台の点検,,,,,○,ルーティン,,",
].join("\n");

describe("業務の整理の取り込み", () => {
  it("頻度を読み取る", () => {
    expect(normalizeFrequency("毎日")).toBe("daily");
    expect(normalizeFrequency("毎週月・木")).toBe("weekly:1,4");
    expect(normalizeFrequency("毎月5日")).toBe("monthly:5");
    expect(normalizeFrequency("")).toBe("once");
  });

  it("「アプリに載せたい」業務を当てはめ、判断できないものに印をつける", () => {
    const { rows } = parseWorkTable(TABLE);
    expect(rows.find((r) => r.work === "口コミの返信")?.target).toBe("routine");
    expect(rows.find((r) => r.work === "紙の在庫表")?.target).toBe("skip");
    expect(rows.find((r) => r.work === "電話の取り方")?.target).toBe("wiki");
    expect(rows.find((r) => r.work === "シャンプー台の点検")?.issues).toContain("担当が空欄");
  });

  it("取り込むと、担当者の「今日やること」（ルーティン・タスク）に出る", async () => {
    const db = getMockStore();
    const { rows } = parseWorkTable(TABLE);
    const wiki: string[] = [];
    const next: string[] = [];
    const res = await applyWorkRows(db, rows, "staff-admin", {
      createWiki: async (t) => void wiki.push(t),
      createNextRequest: async (t) => void next.push(t),
      addRequiredInput: async () => false,
    });
    expect(res.undecided.some((u) => u.includes("シャンプー台の点検"))).toBe(true);
    expect(wiki).toContain("電話の取り方");
    expect(next).toContain("予約の自動キャンセル待ち");
    const tasks = await db.listStaffTasks({ assigneeStaffId: "staff-5" });
    expect(tasks.some((t) => t.title === "ワゴンの補充" && t.taskType === "routine")).toBe(true);
    const routines = await db.listManagerRoutines();
    expect(routines.some((r) => r.title === "口コミの返信" && r.audience === "exec")).toBe(true);
  });
});
