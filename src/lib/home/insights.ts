// ホームの「見える化」5項目の集計。
// 誰に何を見せるかは lib/home/visibility.ts の設定（管理者が変えられる）で決まり、
// 見せてよい分だけをここで組み立てて返す。名前つきのデータは、見せない人の分は最初から作らない
// （画面で隠すだけにしない。この関数の戻り値をそのままAPIで返しても漏れないようにする）。

import { addDays, jstDayBoundsUtc, weekStartOf } from "@/lib/date";
import { brandStoreIds, shortStoreName } from "@/lib/shift/month";
import { isTaskOverdue, routineAchievementByAssignee } from "@/lib/tasks";
import { buildRoutineStatuses } from "@/lib/eni/routines";
import {
  INSIGHT_DEFS,
  levelFor,
  type InsightKey,
  type InsightLevel,
  type InsightVisibility,
} from "@/lib/home/visibility";
import type { DataStore, Staff, Store } from "@/lib/data/types";

export interface InsightViewer {
  staffId: string;
  /** 幹部・管理者（管理者も含めて true） */
  isExec: boolean;
  storeId: string;
  jobType: string;
}

export type InsightTone = "ok" | "warning" | "danger" | "muted";

export interface InsightCard {
  key: InsightKey;
  title: string;
  definition: string;
  /** この人への見せ方 */
  level: InsightLevel;
  /** 本人の分（本人に関係のある項目で、設定が「本人：○」のときだけ） */
  self: { text: string; tone: InsightTone; href?: string } | null;
  /** 集計（level が summary か names のときだけ。名前は入らない） */
  summary: { label: string; value: string; tone?: InsightTone }[] | null;
  /** 名前（level が names のときだけ。それ以外は必ず null） */
  names: { group: string; people: { name: string; note: string }[] }[] | null;
  /** 詳しく見る画面 */
  href?: string;
}

/** ルーティンのやり残しを数える日数（前日までの7日間） */
export const ROUTINE_LOOKBACK_DAYS = 7;
/** トークの未読を「未読者」とみなすまでの時間 */
export const UNREAD_HOURS = 24;
/** 未読を数える投稿の古さの上限（これより古い投稿は数えない） */
export const UNREAD_WINDOW_DAYS = 14;

/** ENiの集計の対象：在籍していて、職種がある人か、ENiの店舗に所属する人 */
function eniPopulation(staff: Staff[], eniStoreIds: Set<string>): Staff[] {
  return staff.filter((s) => s.isActive && (s.jobType !== "" || eniStoreIds.has(s.storeId)));
}

function percent(done: number, total: number): string {
  return total > 0 ? `${Math.round((done / total) * 100)}%` : "—";
}

/**
 * 見える化の5枚のカード（見せない設定の項目は入れない）。
 * now は「24時間たった未読」の判定に使う（テストで固定できるように渡せる）。
 */
export async function buildHomeInsights(
  db: DataStore,
  viewer: InsightViewer,
  visibility: Record<InsightKey, InsightVisibility>,
  today: string,
  now: Date = new Date()
): Promise<InsightCard[]> {
  const [allStaff, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const eniStoreIds = new Set(brandStoreIds(stores, "ENi"));
  const eniStores = stores.filter((s) => eniStoreIds.has(s.id));
  const population = eniPopulation(allStaff, eniStoreIds);
  const staffById = new Map(allStaff.map((s) => [s.id, s]));
  const nameOf = (id: string) => staffById.get(id)?.name ?? "（不明）";
  const storeLabel = (id: string) => shortStoreName(stores.find((s) => s.id === id)?.name ?? "") || "店舗未設定";

  // 5枚は別々のデータから作るので、まとめて並べて取る（並び順は INSIGHT_DEFS のまま）
  const cards = await Promise.all(
    INSIGHT_DEFS.map(async (def): Promise<InsightCard | null> => {
      const vis = visibility[def.key];
      const level = levelFor(vis, viewer);
      if (level === "none" && !vis.self) return null;
      const base = { key: def.key, title: def.title, definition: def.definition, level };
      switch (def.key) {
        case "thanks":
          return thanksCard(db, base, vis.self, viewer, today, nameOf);
        case "weeklyReports":
          return weeklyCard(db, base, vis.self, viewer, today, population, storeLabel, stores);
        case "tasks":
          return tasksCard(db, base, vis.self, viewer, today, population, storeLabel, stores);
        case "unread":
          return unreadCard(db, base, vis.self, viewer, now, population);
        case "routines":
          return routinesCard(db, base, vis.self, viewer, today, eniStores);
      }
    })
  );
  // 本人の分も無く、見せる集計も無いカードは出さない
  return cards.filter((c): c is InsightCard => Boolean(c && (c.self || c.summary || c.names)));
}

type CardBase = Pick<InsightCard, "key" | "title" | "definition" | "level">;

// ① ありがとうを送った人・もらった人（今週の月〜日）
async function thanksCard(
  db: DataStore,
  base: CardBase,
  showSelf: boolean,
  viewer: InsightViewer,
  today: string,
  nameOf: (id: string) => string
): Promise<InsightCard> {
  const weekStart = weekStartOf(today);
  const posts = await db.listThanksPosts({
    from: jstDayBoundsUtc(weekStart).start,
    to: jstDayBoundsUtc(addDays(weekStart, 6)).end,
  });
  const senders = new Map<string, number>();
  const receivers = new Map<string, number>();
  for (const p of posts) {
    senders.set(p.fromStaffId, (senders.get(p.fromStaffId) ?? 0) + 1);
    receivers.set(p.toStaffId, (receivers.get(p.toStaffId) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    ...base,
    href: "/staff/thanks",
    self: showSelf
      ? {
          text: `今週あなたは 送った ${senders.get(viewer.staffId) ?? 0}枚・もらった ${receivers.get(viewer.staffId) ?? 0}枚`,
          tone: "ok",
        }
      : null,
    summary:
      base.level === "none"
        ? null
        : [
            { label: "今週のカード", value: `${posts.length}枚` },
            { label: "送った人", value: `${senders.size}人` },
            { label: "もらった人", value: `${receivers.size}人` },
          ],
    names:
      base.level === "names"
        ? [
            { group: "送った人", people: sorted(senders).map(([id, n]) => ({ name: nameOf(id), note: `${n}枚` })) },
            { group: "もらった人", people: sorted(receivers).map(([id, n]) => ({ name: nameOf(id), note: `${n}枚` })) },
          ].filter((g) => g.people.length > 0)
        : null,
  };
}

// ② 前の週の週報が未完了の人（週報の提出が必要な人＝アシスタント）
async function weeklyCard(
  db: DataStore,
  base: CardBase,
  showSelf: boolean,
  viewer: InsightViewer,
  today: string,
  population: Staff[],
  storeLabel: (id: string) => string,
  stores: Store[]
): Promise<InsightCard> {
  const prevWeek = weekStartOf(addDays(today, -7));
  const required = population.filter((s) => s.jobType === "assistant");
  const reports = await db.listEniReports("weekly", { from: prevWeek, to: prevWeek });
  const submitted = new Set(reports.map((r) => r.staffId));
  const storeIds = orderedStoreIds(required, stores);
  const isRequired = required.some((s) => s.id === viewer.staffId);
  return {
    ...base,
    href: "/staff/eni-reports?tab=weekly",
    self:
      showSelf && isRequired
        ? submitted.has(viewer.staffId)
          ? { text: "前の週の週報は提出済みです", tone: "ok" }
          : { text: "前の週の週報がまだ出ていません", tone: "danger", href: `/staff/weekly-report?week=${prevWeek}` }
        : null,
    summary:
      base.level === "none"
        ? null
        : storeIds.map((storeId) => {
            const inStore = required.filter((s) => s.storeId === storeId);
            const done = inStore.filter((s) => submitted.has(s.id)).length;
            return {
              label: storeLabel(storeId),
              value: `${done}/${inStore.length}（${percent(done, inStore.length)}）`,
              tone: done >= inStore.length ? "ok" : "warning",
            };
          }),
    names:
      base.level === "names"
        ? storeIds
            .map((storeId) => ({
              group: `${storeLabel(storeId)}：未提出`,
              people: required
                .filter((s) => s.storeId === storeId && !submitted.has(s.id))
                .map((s) => ({ name: s.name, note: "" })),
            }))
            .filter((g) => g.people.length > 0)
        : null,
  };
}

// ③ 未完了タスクがある人（期限切れのタスク／前日までの7日間にやり残したルーティン）
async function tasksCard(
  db: DataStore,
  base: CardBase,
  showSelf: boolean,
  viewer: InsightViewer,
  today: string,
  population: Staff[],
  storeLabel: (id: string) => string,
  stores: Store[]
): Promise<InsightCard> {
  const from = addDays(today, -ROUTINE_LOOKBACK_DAYS);
  const to = addDays(today, -1);
  const [tasks, completions] = await Promise.all([
    db.listStaffTasks({ includeDone: false }),
    db.listTaskCompletions({ from, to }),
  ]);
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (isTaskOverdue(t, today)) counts.set(t.assigneeStaffId, (counts.get(t.assigneeStaffId) ?? 0) + 1);
  }
  const achievement = routineAchievementByAssignee(tasks, completions, from, to);
  for (const [staffId, row] of achievement) {
    const missed = row.due - row.done;
    if (missed > 0) counts.set(staffId, (counts.get(staffId) ?? 0) + missed);
  }
  const people = population.filter((s) => (counts.get(s.id) ?? 0) > 0);
  const storeIds = orderedStoreIds(population, stores);
  const mine = counts.get(viewer.staffId) ?? 0;
  return {
    ...base,
    href: "/staff/tasks",
    self: showSelf
      ? mine > 0
        ? { text: `期限切れ・やり残しが ${mine}件あります`, tone: "danger", href: "/staff/tasks" }
        : { text: "期限切れ・やり残しはありません", tone: "ok" }
      : null,
    summary:
      base.level === "none"
        ? null
        : storeIds.map((storeId) => {
            const inStore = people.filter((s) => s.storeId === storeId);
            const items = inStore.reduce((sum, s) => sum + (counts.get(s.id) ?? 0), 0);
            return {
              label: storeLabel(storeId),
              value: inStore.length > 0 ? `${inStore.length}人・${items}件` : "なし",
              tone: inStore.length > 0 ? "warning" : "ok",
            };
          }),
    names:
      base.level === "names"
        ? storeIds
            .map((storeId) => ({
              group: storeLabel(storeId),
              people: people
                .filter((s) => s.storeId === storeId)
                .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
                .map((s) => ({ name: s.name, note: `${counts.get(s.id)}件` })),
            }))
            .filter((g) => g.people.length > 0)
        : null,
  };
}

// ④ トーク通知の未読者（入っているトークで、投稿から24時間たっても未読の人）
async function unreadCard(
  db: DataStore,
  base: CardBase,
  showSelf: boolean,
  viewer: InsightViewer,
  now: Date,
  population: Staff[]
): Promise<InsightCard> {
  const ids = population.map((s) => s.id);
  if (!ids.includes(viewer.staffId)) ids.push(viewer.staffId);
  const members = await db.listChatMembersByStaff(ids);
  const roomIds = [...new Set(members.map((m) => m.roomId))];
  const cutoff = new Date(now.getTime() - UNREAD_HOURS * 3600e3);
  const windowStart = new Date(now.getTime() - UNREAD_WINDOW_DAYS * 86400e3);
  const metas = await db.listChatMessageMeta(roomIds, windowStart, cutoff);
  const byRoom = new Map<string, typeof metas>();
  for (const m of metas) {
    if (m.deleted) continue;
    const list = byRoom.get(m.roomId) ?? [];
    list.push(m);
    byRoom.set(m.roomId, list);
  }
  const unreadOf = new Map<string, number>();
  for (const member of members) {
    const n = (byRoom.get(member.roomId) ?? []).filter(
      (m) => m.senderId !== member.staffId && m.createdAt > member.lastReadAt
    ).length;
    if (n > 0) unreadOf.set(member.staffId, (unreadOf.get(member.staffId) ?? 0) + n);
  }
  const unreadPeople = population.filter((s) => (unreadOf.get(s.id) ?? 0) > 0);
  const readPeople = population.length - unreadPeople.length;
  const mine = unreadOf.get(viewer.staffId) ?? 0;
  return {
    ...base,
    href: "/staff/chat",
    self: showSelf
      ? mine > 0
        ? { text: `24時間以上たった未読が ${mine}件あります`, tone: "warning", href: "/staff/chat" }
        : { text: "24時間以上たった未読はありません", tone: "ok" }
      : null,
    summary:
      base.level === "none"
        ? null
        : [
            {
              label: "既読率",
              value: percent(readPeople, population.length),
              tone: unreadPeople.length === 0 ? "ok" : "warning",
            },
            { label: "未読が残っている人", value: `${unreadPeople.length}人` },
          ],
    names:
      base.level === "names"
        ? [
            {
              group: "24時間以上の未読がある人",
              people: unreadPeople
                .sort((a, b) => (unreadOf.get(b.id) ?? 0) - (unreadOf.get(a.id) ?? 0))
                .map((s) => ({ name: s.name, note: `${unreadOf.get(s.id)}件` })),
            },
          ].filter((g) => g.people.length > 0)
        : null,
  };
}

// ⑤ 店舗ごとの幹部ルーティンの状況（今日の毎日のルーティンの完了率）
async function routinesCard(
  db: DataStore,
  base: CardBase,
  showSelf: boolean,
  viewer: InsightViewer,
  today: string,
  eniStores: Store[]
): Promise<InsightCard> {
  const [routines, checks] = await Promise.all([db.listManagerRoutines(), db.listManagerRoutineChecks([today])]);
  const rows = eniStores.map((store) => {
    const statuses = buildRoutineStatuses(routines, checks, today, { audience: "exec", subjectKey: store.id }).filter(
      (s) => s.routine.cycle === "daily"
    );
    return { store, statuses, done: statuses.filter((s) => s.done).length, total: statuses.length };
  });
  const own = rows.find((r) => r.store.id === viewer.storeId);
  const label = (r: (typeof rows)[number]) => shortStoreName(r.store.name) || r.store.name;
  return {
    ...base,
    href: "/staff/exec?tab=routines",
    // 「自分の分」は、自分の店舗のルーティンを担う幹部にだけ出す
    self:
      showSelf && viewer.isExec && own
        ? {
            text: `${label(own)}の今日のルーティン ${own.done}/${own.total}`,
            tone: own.done >= own.total ? "ok" : "warning",
            href: `/staff/exec?tab=routines&store=${own.store.id}`,
          }
        : null,
    summary:
      base.level === "none"
        ? null
        : rows.map((r) => ({
            label: label(r),
            value: `${r.done}/${r.total}（${percent(r.done, r.total)}）`,
            tone: r.done >= r.total ? "ok" : "warning",
          })),
    names:
      base.level === "names"
        ? rows
            .map((r) => ({
              group: `${label(r)}：まだのルーティン`,
              people: r.statuses.filter((s) => !s.done).map((s) => ({ name: s.routine.title, note: "" })),
            }))
            .filter((g) => g.people.length > 0)
        : null,
  };
}

/** 店舗の並び（店舗マスタの順）。対象者のいる店舗だけ */
function orderedStoreIds(people: Staff[], stores: Store[]): string[] {
  const used = new Set(people.map((s) => s.storeId));
  const ordered = stores.filter((s) => used.has(s.id)).map((s) => s.id);
  const unknown = [...used].filter((id) => !stores.some((s) => s.id === id));
  return [...ordered, ...unknown];
}
