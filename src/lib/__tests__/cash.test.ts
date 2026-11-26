// 依頼13：レジ締め・現金出納帳
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { buildCashBook, canUseCash, countedTotalOf, DEFAULT_CASH_SETTINGS, expectedTotalOf, movementNet, openStoresOf } from "@/lib/cash";
import { addDays, todayJst } from "@/lib/date";
import type { Viewer } from "@/lib/viewer";

describe("レジ締め", () => {
  it("金種ごとの枚数から合計を出す", () => {
    expect(countedTotalOf({ "10000": 3, "5000": 1, "1000": 2, "500": 1, "100": 3, "10": 4, "1": 7 })).toBe(37847);
  });

  it("帳簿＝釣り銭準備金＋現金売上＋入金−出金（両替は数えない）", () => {
    const net = movementNet([
      { direction: "out", amount: 1200, deleted: false },
      { direction: "in", amount: 5000, deleted: false },
      { direction: "none", amount: 10000, deleted: false },
      { direction: "out", amount: 999, deleted: true },
    ]);
    expect(net).toBe(3800);
    expect(expectedTotalOf(30000, 42000, net)).toBe(75800);
  });

  it("入力は店長・副店長と管理者。スタイリスト以下は使えない（イーリスの店舗は初期値で全員）", async () => {
    const db = getMockStore();
    const stores = await db.listStores();
    const base = { session: { staffId: "", name: "", role: "staff", exp: 0 }, isOwner: false, isStoreManager: false, storeScope: [], brand: "eni" } as unknown as Viewer;
    const stylist = { ...base, staffId: "staff-4", me: await db.getStaff("staff-4"), isAdmin: false, isExec: false } as Viewer;
    const exec = { ...base, staffId: "staff-3", me: await db.getStaff("staff-3"), isAdmin: false, isExec: true } as Viewer;
    const eyes = { ...base, staffId: "staff-1", me: await db.getStaff("staff-1"), isAdmin: false, isExec: false } as Viewer;
    expect(await canUseCash(stylist, "store-4", DEFAULT_CASH_SETTINGS, stores)).toBe(false);
    expect(await canUseCash(exec, "store-4", DEFAULT_CASH_SETTINGS, stores)).toBe(true);
    expect(openStoresOf(DEFAULT_CASH_SETTINGS, stores).has("store-1")).toBe(true);
    expect(await canUseCash(eyes, "store-1", DEFAULT_CASH_SETTINGS, stores)).toBe(true);
    expect(await canUseCash(eyes, "store-4", DEFAULT_CASH_SETTINGS, stores)).toBe(false);
  });
});

describe("現金出納帳", () => {
  it("現金売上・出し入れ・過不足から、日付順に残高が積み上がる", async () => {
    const db = getMockStore();
    const month = addDays(todayJst(), -1).slice(0, 7);
    const book = await buildCashBook(db, "store-4", month);
    const sales = book.rows.filter((r) => r.source === "sales");
    expect(sales.length).toBeGreaterThan(0);
    const diff = book.rows.find((r) => r.source === "diff");
    if (diff) expect(diff.expense).toBe(100);
    const last = book.rows[book.rows.length - 1];
    expect(last.balance).toBe(book.closing);
    expect(book.closing).toBe(book.opening + book.totalIn - book.totalOut);
  });
});
