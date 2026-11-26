// 依頼11：AIしもんの見守り・教育／ENi Wikipedia
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { staffHasPermission, canGrant } from "@/lib/permissions";
import { createTraining, listTrainings, restoreRevision, trainingPromptOf, updateTraining } from "@/lib/ai-shimon/training";
import { buildSystemBlocks } from "@/lib/ai-shimon/prompt";
import { bigrams, canSeePage, searchWiki, savePage } from "@/lib/wiki";
import { askWiki } from "@/lib/wiki/ask";
import { cleanNotionTitle, rewriteImageLinks, splitTitle, csvToMarkdownTable } from "@/lib/wiki/text";
import { maskPersonalInfo } from "@/lib/ai/run";

describe("代表だけが、全員の相談を見られる（67）", () => {
  it("代表は「相談を見られる」権限を持ち、代表でない管理者は持てない", async () => {
    const db = getMockStore();
    const owner = await db.getStaff("staff-admin"); // デモでは管理者が代表
    const staff = await db.getStaff("staff-3");
    expect(owner?.isOwner).toBe(true);
    expect(await staffHasPermission(owner, "ai_shimon_logs")).toBe(true);
    expect(await staffHasPermission(staff, "ai_shimon_logs")).toBe(false);
    // 代表だけの権限は、代表でない人には付けられない（管理者でも）
    const notOwnerAdmin = { ...owner!, id: "x", isOwner: false };
    expect(canGrant(notOwnerAdmin, "ai_shimon_logs", notOwnerAdmin)).toBe(false);
    expect(canGrant(owner!, "ai_shimon_logs", staff!)).toBe(false);
  });
});

describe("会話を記憶させない・教育は代表だけ（69）", () => {
  it("AIに渡す指示には、ほかの人の相談も前の会話も入らない（今の会話と教育だけ）", async () => {
    const db = getMockStore();
    const secret = "ほかの人には絶対に言わない秘密の相談XYZ";
    await db.addAiShimonMessages([{ staffId: "staff-5", threadId: "thread-secret", role: "user", content: secret, createdAt: new Date() }]);
    const training = trainingPromptOf(await listTrainings());
    const blocks = buildSystemBlocks([{ role: "user", content: "練習のことで相談したい" }], { name: "藤田 ひかり", roleLabel: "アシスタント" }, { training });
    const all = blocks.map((b) => b.text).join("\n");
    expect(all).not.toContain(secret);
    expect(all).toContain("代表（しもん）からの教育");
  });

  it("止めた項目は答えに使わず、履歴から前の状態に戻せる", async () => {
    const item = await createTraining({ kind: "phrases", title: "口ぐせ", body: "いいね、それでいこう", editedBy: "staff-admin" });
    expect(trainingPromptOf(await listTrainings())).toContain("いいね、それでいこう");
    await updateTraining(item.id, { isActive: false }, "staff-admin", "stop");
    expect(trainingPromptOf(await listTrainings())).not.toContain("いいね、それでいこう");
    const revs = await fx().aiTrainingRevisions.list({ where: { trainingId: item.id }, order: [["createdAt", "asc"]] });
    await restoreRevision(revs[0].id, "staff-admin");
    expect(trainingPromptOf(await listTrainings())).toContain("いいね、それでいこう");
  });
});

describe("ENi Wikipedia（68）", () => {
  const staffView = { isAdmin: false, isExec: false };
  const execView = { isAdmin: false, isExec: true };

  it("見る権限のないページは、一覧・検索に出ない", async () => {
    const page = { visibility: "exec" as const, deleted: false };
    expect(canSeePage(page, staffView)).toBe(false);
    expect(canSeePage(page, execView)).toBe(true);
    const staffHits = await searchWiki("店長会議の進め方", staffView);
    const execHits = await searchWiki("店長会議の進め方", execView);
    expect(staffHits.some((h) => h.page.title.includes("店長会議"))).toBe(false);
    expect(execHits.some((h) => h.page.title.includes("店長会議"))).toBe(true);
  });

  it("日本語は2文字ずつで探し、遅刻の連絡のページが当たる", async () => {
    expect(bigrams("遅刻の連絡")).toContain("遅刻");
    const hits = await searchWiki("遅刻しそうなときの連絡", staffView);
    expect(hits[0]?.page.title).toBe("遅刻・欠勤の連絡のしかた");
  });

  it("Wikiに答えが無ければ、AIを呼ばずに「見つかりません」", async () => {
    const res = await askWiki(getMockStore(), { question: "宇宙旅行の申し込み方法", staffId: "staff-5", viewer: staffView });
    expect(res.found).toBe(false);
    expect(res.ai).toBe(false);
    expect(res.note).toContain("見つかりません");
  });

  it("AIのキーが無いときは、候補のページだけを出す（画面は止めない）", async () => {
    const res = await askWiki(getMockStore(), { question: "シャンプーのすすぎ", staffId: "staff-5", viewer: staffView });
    expect(res.ai).toBe(false);
    expect(res.hits.length).toBeGreaterThan(0);
  });

  it("ページを直すと履歴が残る", async () => {
    const p = await savePage({ title: "テストのページ", category: "そのほか", body: "はじめ", visibility: "all", editedBy: "staff-admin" });
    await savePage({ id: p.id, title: "テストのページ", category: "そのほか", body: "直した", visibility: "all", editedBy: "staff-admin" });
    const revs = await fx().wikiRevisions.list({ where: { pageId: p.id } });
    expect(revs.length).toBe(2);
  });

  it("Notionの書き出しのファイル名・題名・画像・表を整える", () => {
    expect(cleanNotionTitle("ENi/就業規則 0123456789abcdef0123456789abcdef.md")).toBe("就業規則");
    expect(splitTitle("# 就業規則\n\n本文", "x")).toEqual({ title: "就業規則", body: "本文" });
    expect(rewriteImageLinks("![](%E7%94%BB%E5%83%8F/a.png)", (p) => (p === "画像/a.png" ? "/api/wiki/image/1" : null))).toBe("![](/api/wiki/image/1)");
    expect(csvToMarkdownTable([["名前", "内容"], ["A", "B|C"]])).toContain("| A | B｜C |");
  });
});

describe("AIに送る前に個人情報を伏せる", () => {
  it("電話番号・メールアドレスを伏せる", () => {
    expect(maskPersonalInfo("090-1234-5678 と test@example.com")).toBe("［電話番号］ と ［メール］");
  });
});
