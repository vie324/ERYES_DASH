// 依頼1（追加6）：幹部メニューの「大切にすること」
import { describe, expect, it } from "vitest";
import { DEFAULT_EXEC_VALUES, EXEC_VALUES_KEY, getExecValues, normalizeTextSetting, textSettingOf } from "@/lib/settings";
import { isExecutive } from "@/lib/eni/access";
import { getMockStore } from "@/lib/data/mock-store";
import type { Session } from "@/lib/auth/session";

const session = (staffId: string, role: "admin" | "staff" = "staff"): Session => ({
  staffId,
  name: "",
  role,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

describe("大切にすること", () => {
  it("初期の文面はいただいたまま6行（「アンテナを貼り」も原文のまま）", () => {
    const lines = DEFAULT_EXEC_VALUES.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("細かいことでも情報提供し、さらに情報や高い視点の共有を自ら求めにいくこと。");
    expect(lines[5]).toBe("スタッフの表情や言葉にアンテナを貼り、良い水質づくりの意識を持つ");
  });

  it("未入力なら初期の文面、入力があればその文面", () => {
    expect(textSettingOf([], EXEC_VALUES_KEY)).toBe(DEFAULT_EXEC_VALUES);
    expect(textSettingOf([{ key: EXEC_VALUES_KEY, value: "  " }], EXEC_VALUES_KEY)).toBe(DEFAULT_EXEC_VALUES);
    expect(textSettingOf([{ key: EXEC_VALUES_KEY, value: "1行目\n2行目" }], EXEC_VALUES_KEY)).toBe("1行目\n2行目");
  });

  it("保存前に改行をそろえ、空行を落とす", () => {
    expect(normalizeTextSetting(EXEC_VALUES_KEY, "a \r\n\r\nb\r c  ")).toBe("a\nb\n c");
  });

  it("管理者が書き換えると、幹部メニューの表示もその文面になる", async () => {
    const db = getMockStore();
    await db.setAppSetting(EXEC_VALUES_KEY, "朝礼で想いを伝える\n営業後フィードバック");
    expect(await getExecValues(db)).toEqual(["朝礼で想いを伝える", "営業後フィードバック"]);
    await db.setAppSetting(EXEC_VALUES_KEY, "");
    expect(await getExecValues(db)).toHaveLength(6);
  });

  it("幹部メニュー（大切にすること）に入れるのは幹部と管理者だけ", async () => {
    // デモ：staff-admin＝管理者、staff-3＝幹部のスタイリスト、staff-4＝スタイリスト、staff-5＝アシスタント
    expect(await isExecutive(session("staff-admin", "admin"))).toBe(true);
    expect(await isExecutive(session("staff-3"))).toBe(true);
    expect(await isExecutive(session("staff-4"))).toBe(false);
    expect(await isExecutive(session("staff-5"))).toBe(false);
  });
});
