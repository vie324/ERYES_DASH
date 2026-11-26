"use server";

// 依頼10：社内SNSの設定（カテゴリ・スタンプ・ポイント・注意書き・賞の名前）と、昔のサンクスカードの取り込み。管理者だけ。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { InputError, attempt, resultUrl, str } from "@/lib/action-utils";
import { intIn, linesOf, writeJsonSetting } from "@/lib/feature-settings";
import { DEFAULT_SNS_SETTINGS, SNS_SETTINGS_KEY, matchStaffByName, parseThanksCsv, type SnsSettings } from "@/lib/sns";

export async function saveSnsSettingsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const r = await attempt(async () => {
    const categories = linesOf(str(fd, "categories", 2000), { max: 20, maxLength: 20 });
    const stamps = linesOf(str(fd, "stamps", 500), { max: 16, maxLength: 4 });
    const awardTitles = linesOf(str(fd, "award_titles", 1000), { max: 10, maxLength: 30 });
    if (categories.length === 0) throw new InputError("カテゴリを1つ以上入れてください");
    const next: SnsSettings = {
      categories,
      stamps: stamps.length > 0 ? stamps : DEFAULT_SNS_SETTINGS.stamps,
      monthlyPoints: intIn(fd.get("monthly_points"), 0, 100000, DEFAULT_SNS_SETTINGS.monthlyPoints),
      maxPointsPerThanks: intIn(fd.get("max_points"), 0, 100000, DEFAULT_SNS_SETTINGS.maxPointsPerThanks),
      postNotice: str(fd, "post_notice", 300) || DEFAULT_SNS_SETTINGS.postNotice,
      awardTitles: awardTitles.length > 0 ? awardTitles : DEFAULT_SNS_SETTINGS.awardTitles,
    };
    await writeJsonSetting(getDataStore(), SNS_SETTINGS_KEY, next);
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl("/admin/sns", r));
}

/**
 * 昔のサンクスカードの取り込み（CSV：日付・送った人・もらった人・メッセージ）。
 * 名前はスタッフ（空白を無視・呼び名でも可）と照合し、一致しない人は名前のまま残す。消さずに足すだけ。
 * 同じ日付・同じ2人・同じメッセージのカードは2回入れない。
 */
export async function importThanksCsvAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const file = fd.get("csv");
  const r = await attempt(async () => {
    const text = file instanceof File && file.size > 0 ? await file.text() : str(fd, "csv_text", 500_000);
    if (!text.trim()) throw new InputError("CSVファイルを選ぶか、中身を貼り付けてください");
    const { rows, errors } = parseThanksCsv(text);
    if (rows.length === 0) throw new InputError(errors[0] ?? "取り込める行がありませんでした");
    const db = getDataStore();
    const staff = await db.listStaff();
    const existing = await fx().thanksExtras.list({ where: { source: "import" } });
    const key = (d: string, a: string, b: string, body: string) => `${d}|${a}|${b}|${body}`;
    const seen = new Set(existing.map((x) => key(x.originalDate, x.fromStaffId ?? x.fromName, x.toStaffId ?? x.toName, x.body)));
    const toInsert = [];
    let unmatched = 0;
    for (const row of rows) {
      const from = matchStaffByName(staff, row.from);
      const to = matchStaffByName(staff, row.to);
      if (!from || !to) unmatched++;
      const k = key(row.date, from?.id ?? row.from, to?.id ?? row.to, row.body);
      if (seen.has(k)) continue;
      seen.add(k);
      toInsert.push({
        thanksId: null,
        fromStaffId: from?.id ?? null,
        toStaffId: to?.id ?? null,
        fromName: from ? "" : row.from,
        toName: to ? "" : row.to,
        body: row.body,
        cardColor: "gold",
        originalDate: row.date,
        source: "import" as const,
      });
    }
    await fx().thanksExtras.insertMany(toInsert);
    return `${toInsert.length}件を取り込みました${unmatched ? `（名前がスタッフと一致しなかった ${unmatched}件は、名前のまま残しました）` : ""}${
      errors.length ? `／${errors.slice(0, 3).join("、")}` : ""
    }`;
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl("/admin/sns", r));
}

