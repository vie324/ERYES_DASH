// 依頼23：面接（見られる人・面接官の予定・評価はそろうまで見えない・録画の保存期間）
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { addDays, todayJst } from "@/lib/date";
import {
  accessTo,
  addMonthsToDate,
  evaluationState,
  interviewsOf,
  parseEvaluationLines,
  recordingPurgeJob,
  saveInterview,
  setApplicantStatus,
  submitEvaluation,
  visibleApplicants,
} from "@/lib/recruit";

async function staff(id: string) {
  return (await getMockStore().getStaff(id))!;
}

async function applicantNamed(name: string) {
  return (await fx().applicants.find({ name }))!;
}

describe("見られる人", () => {
  it("管理者は全員、面接官は自分が入る応募者だけ、それ以外の人は誰も見られない", async () => {
    const admin = await visibleApplicants(await staff("staff-admin"));
    expect(admin.length).toBeGreaterThanOrEqual(3);
    const yuina = await visibleApplicants(await staff("staff-4"));
    expect(yuina.map((a) => a.name)).toEqual(["見本 花子"]);
    expect(await visibleApplicants(await staff("staff-5"))).toEqual([]);
    const hanako = await applicantNamed("見本 花子");
    expect(await accessTo(await staff("staff-5"), hanako)).toBeNull();
    const a = await accessTo(await staff("staff-4"), hanako);
    expect(a).toEqual({ manage: false, interviewer: true, recordings: true });
  });
});

describe("評価シート", () => {
  it("全員がつけ終わるまで、ほかの面接官の評価は見えない。そろったら全員分が見え、管理側に知らせる", async () => {
    const db = getMockStore();
    const hanako = await applicantNamed("見本 花子");
    const [interview] = await interviewsOf(hanako.id);
    const before = await evaluationState(interview, "staff-4");
    expect(before.submitted).toBe(2);
    expect(before.allDone).toBe(false);
    expect(before.visible).toEqual([]);
    // 出した人も、そろうまでは自分のものだけ
    expect((await evaluationState(interview, "staff-3")).visible.map((e) => e.interviewerId)).toEqual(["staff-3"]);
    await expect(submitEvaluation(db, interview, hanako, "staff-4", { impression: 9 }, "")).rejects.toThrow();
    await expect(submitEvaluation(db, interview, hanako, "staff-5", {}, "")).rejects.toThrow(/面接官ではありません/);
    const notes = (await db.listAppNotifications("staff-admin", 100)).length;
    const r = await submitEvaluation(db, interview, hanako, "staff-4", { impression: 3, communication: 4, values: 4, motivation: 4, skill: 2 }, "まじめ");
    expect(r.allDone).toBe(true);
    const after = await evaluationState(interview, "staff-4");
    expect(after.visible).toHaveLength(3);
    expect((await db.listAppNotifications("staff-admin", 100)).length).toBe(notes + 1);
    await expect(submitEvaluation(db, interview, hanako, "staff-4", { impression: 1, communication: 1, values: 1, motivation: 1, skill: 1 }, "")).rejects.toThrow(/もう直せません/);
  });

  it("評価シートの項目は管理画面の行から作り、記号が無い行には記号を作る", () => {
    const items = parseEvaluationLines("impression|第一印象|5\n技術の基礎|10\n空の行は無視\n");
    expect(items[0]).toEqual({ key: "impression", label: "第一印象", max: 5 });
    expect(items[1].key).toMatch(/^i_[0-9a-f]{6}$/);
    expect(items[1].max).toBe(10);
    expect(parseEvaluationLines("技術の基礎|10")[0].key).toBe(items[1].key);
  });
});

describe("面接の予定", () => {
  it("面接官の予定に入り、面接官を外すと予定からも消える", async () => {
    const db = getMockStore();
    const taro = await applicantNamed("見本 太郎");
    const date = addDays(todayJst(), 3);
    const saved = await saveInterview(db, taro, { date, startTime: "13:00", endTime: "14:00", place: "本店", interviewerIds: ["staff-3", "staff-4", "staff-6"] }, "staff-admin");
    const events = await fx().personalEvents.list({ where: { sourceId: saved.id } });
    expect(events.map((e) => e.staffId).sort()).toEqual(["staff-3", "staff-4", "staff-6"]);
    expect(events[0].title).toContain("見本 太郎");
    expect((await db.listAppNotifications("staff-6", 50)).some((n) => n.title.includes("面接官に選ばれました"))).toBe(true);
    await saveInterview(db, taro, { date, startTime: "13:00", endTime: "14:00", place: "本店", interviewerIds: ["staff-3"] }, "staff-admin", saved.id);
    expect((await fx().personalEvents.list({ where: { sourceId: saved.id } })).map((e) => e.staffId)).toEqual(["staff-3"]);
    await expect(saveInterview(db, taro, { date, startTime: "13:00", endTime: "14:00", place: "", interviewerIds: ["staff-1", "staff-2", "staff-3", "staff-4"] }, "staff-admin")).rejects.toThrow(/3人まで/);
  });
});

describe("録画の保存期間", () => {
  it("選考が終わった日から保存期間（6か月）を決め、戻すと消す日もなくなる", async () => {
    const db = getMockStore();
    const taro = await applicantNamed("見本 太郎");
    await setApplicantStatus(db, taro, "hired");
    const rec = (await fx().interviewRecordings.list({ where: { applicantId: taro.id } }))[0];
    expect(rec.deleteAfter).toBe(addMonthsToDate(todayJst(), 6));
    await setApplicantStatus(db, (await fx().applicants.get(taro.id))!, "active");
    expect((await fx().interviewRecordings.get(rec.id))?.deleteAfter).toBe("");
  });

  it("保存期間を過ぎた録画は、毎日の定期実行で消える", async () => {
    const db = getMockStore();
    const msg = await recordingPurgeJob(db, todayJst());
    expect(msg).toMatch(/^1件/);
    const jiro = await applicantNamed("見本 次郎");
    const rec = (await fx().interviewRecordings.list({ where: { applicantId: jiro.id } }))[0];
    expect(rec.deletedAt).not.toBeNull();
    expect(rec.providerRef).toBe("");
  });

  it("月末をこえる日は月末にそろえる", () => {
    expect(addMonthsToDate("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsToDate("2026-05-10", 6)).toBe("2026-11-10");
  });
});
