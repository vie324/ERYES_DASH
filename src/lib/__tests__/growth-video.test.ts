// 依頼20：成長ロードマップ（1本の時間軸）と、動画の再生のURL
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { growthTimeline, monthsBetween, stagesFor, videoProgressFor } from "@/lib/growth";
import { playSourceFor, uploadProvider } from "@/lib/video";

describe("成長ロードマップ", () => {
  it("入社からの月数は、日がまだ来ていなければ1か月少なく数える", () => {
    expect(monthsBetween("2026-01-10", "2026-06-09")).toBe(4);
    expect(monthsBetween("2026-01-10", "2026-06-10")).toBe(5);
    expect(monthsBetween("2025-12-31", "2026-01-01")).toBe(0);
  });

  it("段階は職種・店舗（イーリス）で分かれ、ENiで職種が未設定の人にはENiの段階を出す", async () => {
    const assistant = await stagesFor("assistant", false);
    expect(assistant.some((s) => s.name === "シャンプーデビュー")).toBe(true);
    expect(assistant.some((s) => s.jobType === "eyes")).toBe(false);
    const eyes = await stagesFor("", true);
    expect(eyes.map((s) => s.name)).toEqual(["まつげ施術デビュー"]);
    expect((await stagesFor("", false)).length).toBe(assistant.length);
  });

  it("合格した項目・次の目標・目安を過ぎた段階（遅れ）が出る", async () => {
    const db = getMockStore();
    const aoi = (await db.getStaff("staff-5"))!;
    const tl = await growthTimeline(db, aoi);
    expect(tl.monthsSinceJoin).toBeGreaterThanOrEqual(4);
    expect(tl.current?.stage.name).toBe("入社オリエンテーション");
    expect(tl.next?.stage.name).toBe("シャンプーデビュー");
    // 入社3か月の目安を過ぎていて、まだ合格していない
    expect(tl.next?.late).toBe(true);
    expect(tl.stages[0].done).toBe(true);
    expect(tl.next?.items.find((i) => i.title === "シャンプー 合格")?.result?.status).toBe("retry");

    const hikari = (await db.getStaff("staff-6"))!;
    const tl2 = await growthTimeline(db, hikari);
    expect(tl2.current?.stage.name).toBe("シャンプーデビュー");
    expect(tl2.next?.stage.name).toBe("カラーアシスト");
    expect(tl2.next?.late).toBe(true);
    expect(tl2.practiceByMonth).toHaveLength(6);
  });

  it("どこまで見たかが割合で出る", async () => {
    const p = await videoProgressFor("staff-5");
    const [first] = [...p.values()];
    expect(first.pct).toBe(40);
    expect(first.completed).toBe(false);
  });
});

describe("動画の再生のURL", () => {
  it("置き場所が未設定（デモ）のときは試し用のURLで、保護されていないことが分かる", async () => {
    expect(uploadProvider()).toBe("url");
    const video = (await fx().curriculumVideos.list())[0];
    const src = await playSourceFor(video);
    expect(src.unprotected).toBe(true);
    expect(src.kind).toBe("hls");
    expect(src.expiresAt).toBeGreaterThan(Date.now());
  });
});
