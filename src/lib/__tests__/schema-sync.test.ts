// 依頼10〜23：アプリの中のテーブルの定義（lib/data/tables.ts）と supabase/schema.sql がずれていないか。
// 列を足したのに schema.sql に書き忘れると、本番だけ「準備中」になるので、ここで気づけるようにする。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tables } from "@/lib/data/tables";

const schema = readFileSync(fileURLToPath(new URL("../../../supabase/schema.sql", import.meta.url)), "utf8");
const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261126_requests_10_23.sql", import.meta.url)), "utf8");
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function columnsOf(sql: string, table: string): Set<string> {
  const cols = new Set<string>();
  const block = new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? "";
  for (const line of block.split("\n")) {
    const m = /^\s+([a-z_]+)\s/.exec(line);
    if (m) cols.add(m[1]);
  }
  for (const m of sql.matchAll(new RegExp(`alter table ${table} add column if not exists ([a-z_]+)`, "g"))) cols.add(m[1]);
  return cols;
}

describe("supabase/schema.sql と tables.ts", () => {
  for (const def of Object.values(tables)) {
    it(`${def.name} の列がすべてある・RLSが有効`, () => {
      const cols = columnsOf(schema, def.name);
      const missing = Object.keys(def.cols).map(snake).filter((c) => !cols.has(c));
      expect(missing, `${def.name} に無い列`).toEqual([]);
      expect(schema).toContain(`alter table ${def.name} enable row level security;`);
      // 追加のマイグレーションのファイルにも同じ定義がある
      expect(columnsOf(migration, def.name).size).toBeGreaterThan(0);
    });
  }

  it("upsert に使う列の組み合わせに一意の索引がある", () => {
    const keys: [string, string[]][] = [
      ["staff_permissions", ["staff_id", "permission"]],
      ["ai_cache", ["cache_key"]],
      ["instagram_daily", ["account_id", "date"]],
      ["instagram_media", ["account_id", "media_id"]],
    ];
    for (const [table, cols] of keys) {
      expect(schema).toMatch(new RegExp(`create unique index if not exists \\w+ on ${table} \\(${cols.join(", ")}\\)`));
    }
  });
});
