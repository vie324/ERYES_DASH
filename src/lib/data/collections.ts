// 追加機能（2026-11 依頼10〜23）のデータの置き場所。
// これまでの機能は DataStore（types.ts）に1つずつメソッドを足してきたが、テーブルが一気に増えるため、
// 「テーブルの定義（列と型）」だけを書けば、デモ用（メモリ内）と本番（Supabase）の両方で同じように
// 読み書きできる共通の入口を用意した。使い方は lib/data/tables.ts と、各機能の lib/<機能>/ を参照。
//
//  ・列名は camelCase で書くと、DBでは snake_case になる（staffId → staff_id）
//  ・すべてのテーブルに id（uuid）を持たせる。重複させたくない組み合わせは schema.sql の一意インデックスで決める
//  ・本番DBにまだテーブルが無い（schema.sql を流す前の）ときは、読むと「空」、書くと FeatureNotReadyError。
//    画面はエラーにならず、その機能だけが「準備中」になる（CLAUDE.md の 6）
//  ・デモモードでは起動のたびにデモデータ（lib/demo/feature-seed.ts）が入る

import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * 列の型。
 *  text …… 文字（未指定は ""）／int・num …… 数（未指定は 0）／bool …… 真偽（未指定は false。isActive だけ true）
 *  date …… "YYYY-MM-DD" の文字（未指定は ""）／ts …… 日時（Date。未指定は null。createdAt・updatedAt は今）
 *  json …… JSON（未指定は null）／jsonArr …… JSONの配列（未指定は []）／jsonObj …… JSONのオブジェクト（未指定は {}）
 *  arr …… 文字の配列（text[]。未指定は []）／ref …… ほかの行のID（uuid。未指定は null）
 */
export type ColType = "text" | "int" | "num" | "bool" | "date" | "ts" | "json" | "jsonArr" | "jsonObj" | "arr" | "ref";

export interface TableDef<T extends { id: string }> {
  name: string;
  cols: { [K in keyof T]-?: ColType };
}

/** テーブルの定義。cols には型のすべての列を書く（書き漏れは型エラーになる） */
export function defineTable<T extends { id: string }>(name: string, cols: { [K in keyof T]-?: ColType }): TableDef<T> {
  return { name, cols };
}

/** 条件（列ごと）：値そのもの＝一致／{in}／{gte,lte,gt,lt}／{neq}／{isNull} */
export type Cond<V> =
  | V
  | { in: V[] }
  | { gte?: V; lte?: V; gt?: V; lt?: V }
  | { neq: V }
  | { isNull: boolean };
export type Where<T> = { [K in keyof T]?: Cond<T[K]> };

export interface Query<T> {
  where?: Where<T>;
  /** 並び順（先に書いたものが優先） */
  order?: [keyof T & string, "asc" | "desc"][];
  limit?: number;
}

/** 書き込みの入力（id は省略可。ほかの列も省略すると型ごとの初期値） */
export type NewRow<T extends { id: string }> = Partial<T>;
export type Patch<T extends { id: string }> = Partial<Omit<T, "id">>;

export interface Collection<T extends { id: string }> {
  readonly def: TableDef<T>;
  list(q?: Query<T>): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** 条件に合う最初の1行（並び順を付けたいときは list を使う） */
  find(where: Where<T>): Promise<T | null>;
  count(where?: Where<T>): Promise<number>;
  insert(row: NewRow<T>): Promise<T>;
  insertMany(rows: NewRow<T>[]): Promise<T[]>;
  update(id: string, patch: Patch<T>): Promise<T | null>;
  updateWhere(where: Where<T>, patch: Patch<T>): Promise<number>;
  remove(id: string): Promise<void>;
  removeWhere(where: Where<T>): Promise<number>;
  /** keys の組み合わせで1行（あれば渡した列だけ書き換え、無ければ足す）。schema.sql に同じ組の一意インデックスが要る */
  upsert(row: NewRow<T>, keys: (keyof T & string)[]): Promise<T>;
}

/** 本番DBにまだテーブル（列）が無い。schema.sql の追加分を流すと直る */
export class FeatureNotReadyError extends Error {
  constructor(public readonly table: string) {
    super(`この機能のデータベースがまだ用意されていません（${table}）。管理者が supabase/schema.sql を実行すると使えるようになります。`);
    this.name = "FeatureNotReadyError";
  }
}

// ---------------------------------------------------------------- 共通の小物

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function isOp(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || v instanceof Date || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => ["in", "gte", "lte", "gt", "lt", "neq", "isNull"].includes(k));
}

function defaultOf(col: string, type: ColType): unknown {
  switch (type) {
    case "text":
    case "date":
      return "";
    case "int":
    case "num":
      return 0;
    case "bool":
      // 「使う」の印（isActive）だけは、はじめから使う状態にする（schema.sql の初期値も true）
      return col === "isActive";
    case "ts":
      return col === "createdAt" || col === "updatedAt" ? new Date() : null;
    case "jsonArr":
    case "arr":
      return [];
    case "jsonObj":
      return {};
    default:
      return null;
  }
}

/** DBから読んだ値を、アプリの型にそろえる */
function fromDb(type: ColType, v: unknown): unknown {
  switch (type) {
    case "text":
    case "date":
      return v === null || v === undefined ? "" : String(v);
    case "int":
    case "num": {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    }
    case "bool":
      return v === true;
    case "ts":
      return v ? new Date(String(v)) : null;
    case "jsonArr":
      return Array.isArray(v) ? v : [];
    case "jsonObj":
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    case "arr":
      return Array.isArray(v) ? v.map(String) : [];
    case "ref":
      return v === null || v === undefined || v === "" ? null : String(v);
    default:
      return v ?? null;
  }
}

function toDb(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  if (x === null || x === undefined) return -1;
  if (y === null || y === undefined) return 1;
  return (x as number) < (y as number) ? -1 : 1;
}

function same(a: unknown, b: unknown): boolean {
  return compare(a, b) === 0;
}

function matches<T>(row: T, where: Where<T> | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where) as [keyof T & string, unknown][]) {
    if (cond === undefined) continue;
    const v = (row as Record<string, unknown>)[key];
    if (isOp(cond)) {
      if ("in" in cond && !(cond.in as unknown[]).some((x) => same(x, v))) return false;
      if ("neq" in cond && same(cond.neq, v)) return false;
      if ("isNull" in cond && (v === null || v === undefined || v === "") !== cond.isNull) return false;
      if ("gte" in cond && cond.gte !== undefined && compare(v, cond.gte) < 0) return false;
      if ("gt" in cond && cond.gt !== undefined && compare(v, cond.gt) <= 0) return false;
      if ("lte" in cond && cond.lte !== undefined && compare(v, cond.lte) > 0) return false;
      if ("lt" in cond && cond.lt !== undefined && compare(v, cond.lt) >= 0) return false;
    } else if (!same(cond, v)) {
      return false;
    }
  }
  return true;
}

/** {in: []} のような「何にも当たらない」条件か（DBに聞くまでもなく空） */
function matchesNothing<T>(where: Where<T> | undefined): boolean {
  if (!where) return false;
  return Object.values(where).some((c) => isOp(c) && "in" in c && Array.isArray(c.in) && c.in.length === 0);
}

function sortRows<T>(rows: T[], order: Query<T>["order"]): T[] {
  if (!order || order.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const [key, dir] of order) {
      const c = compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
      if (c !== 0) return dir === "asc" ? c : -c;
    }
    return 0;
  });
}

// ---------------------------------------------------------------- デモ用（メモリ内）

type MemTables = Map<string, Record<string, unknown>[]>;
const g = globalThis as unknown as {
  __eryesCollections?: MemTables;
  __eryesCollectionsSeed?: Promise<void> | null;
};

/** 足りない列を型ごとの初期値で埋めた1行にする（id が無ければ作る） */
export function fillRow<T extends { id: string }>(def: TableDef<T>, row: NewRow<T>): T {
  const out: Record<string, unknown> = {};
  for (const [col, type] of Object.entries(def.cols) as [string, ColType][]) {
    const v = (row as Record<string, unknown>)[col];
    out[col] = v === undefined ? defaultOf(col, type) : v;
  }
  if (!out.id) out.id = randomUUID();
  return out as T;
}

/** デモデータを入れる関数に渡す「入れ物」：テーブルの定義と行（足りない列は初期値で埋まる） */
export type DemoPut = <T extends { id: string }>(def: TableDef<T>, rows: NewRow<T>[]) => T[];

/** デモデータを入れる関数（lib/demo/feature-seed.ts が登録する。循環参照を避けるため登録式） */
let demoSeeder: ((put: DemoPut) => Promise<void>) | null = null;
export function registerDemoSeeder(fn: (put: DemoPut) => Promise<void>): void {
  demoSeeder = fn;
}

function memTables(): MemTables {
  if (!g.__eryesCollections) g.__eryesCollections = new Map();
  return g.__eryesCollections;
}

async function ensureSeeded(): Promise<void> {
  if (g.__eryesCollectionsSeed === undefined) {
    g.__eryesCollectionsSeed = (async () => {
      if (!demoSeeder) {
        // 登録前（テストなどで lib/demo を読み込んでいない）なら、ここで読み込む
        await import("@/lib/demo/feature-seed").catch(() => undefined);
      }
      if (!demoSeeder) return;
      const tables = memTables();
      const put: DemoPut = (def, rows) => {
        const list = tables.get(def.name) ?? [];
        const filled = rows.map((r) => fillRow(def, r));
        list.push(...(filled as unknown as Record<string, unknown>[]));
        tables.set(def.name, list);
        return filled;
      };
      await demoSeeder(put);
    })().catch((e) => {
      console.error(`[collections] デモデータの用意に失敗: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
  await g.__eryesCollectionsSeed;
}

class MemoryCollection<T extends { id: string }> implements Collection<T> {
  constructor(public readonly def: TableDef<T>) {}

  private rows(): Record<string, unknown>[] {
    const tables = memTables();
    if (!tables.has(this.def.name)) tables.set(this.def.name, []);
    return tables.get(this.def.name)!;
  }

  private fill(row: NewRow<T>): T {
    return fillRow(this.def, row);
  }

  async list(q: Query<T> = {}): Promise<T[]> {
    await ensureSeeded();
    const hit = this.rows().filter((r) => matches(r as T, q.where)) as T[];
    const sorted = sortRows(hit, q.order);
    return structuredClone(q.limit ? sorted.slice(0, q.limit) : sorted);
  }

  async get(id: string): Promise<T | null> {
    await ensureSeeded();
    const row = this.rows().find((r) => r.id === id);
    return row ? (structuredClone(row) as T) : null;
  }

  async find(where: Where<T>): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async count(where?: Where<T>): Promise<number> {
    await ensureSeeded();
    return this.rows().filter((r) => matches(r as T, where)).length;
  }

  async insert(row: NewRow<T>): Promise<T> {
    await ensureSeeded();
    const full = this.fill(row);
    this.rows().push(structuredClone(full) as Record<string, unknown>);
    return full;
  }

  async insertMany(rows: NewRow<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const r of rows) out.push(await this.insert(r));
    return out;
  }

  async update(id: string, patch: Patch<T>): Promise<T | null> {
    await ensureSeeded();
    const row = this.rows().find((r) => r.id === id);
    if (!row) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && k !== "id") row[k] = structuredClone(v);
    return structuredClone(row) as T;
  }

  async updateWhere(where: Where<T>, patch: Patch<T>): Promise<number> {
    await ensureSeeded();
    let n = 0;
    for (const row of this.rows()) {
      if (!matches(row as T, where)) continue;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined && k !== "id") row[k] = structuredClone(v);
      n++;
    }
    return n;
  }

  async remove(id: string): Promise<void> {
    await ensureSeeded();
    const rows = this.rows();
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
  }

  async removeWhere(where: Where<T>): Promise<number> {
    await ensureSeeded();
    const rows = this.rows();
    const keep = rows.filter((r) => !matches(r as T, where));
    const removed = rows.length - keep.length;
    rows.splice(0, rows.length, ...keep);
    return removed;
  }

  async upsert(row: NewRow<T>, keys: (keyof T & string)[]): Promise<T> {
    await ensureSeeded();
    const where = Object.fromEntries(keys.map((k) => [k, (row as Record<string, unknown>)[k]])) as Where<T>;
    const existing = this.rows().find((r) => matches(r as T, where));
    if (existing) {
      for (const [k, v] of Object.entries(row)) if (v !== undefined && k !== "id" && k !== "createdAt") existing[k] = structuredClone(v);
      return structuredClone(existing) as T;
    }
    return this.insert(row);
  }
}

// ---------------------------------------------------------------- 本番（Supabase）

let sbClient: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!sbClient) {
    sbClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
  }
  return sbClient;
}

/** テーブル・列が無いことを表すエラーか（PostgREST・PostgreSQLのコード） */
function isMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return ["PGRST205", "PGRST204", "PGRST200", "42P01", "42703"].includes(error.code ?? "");
}

/** まだ用意されていないテーブル（画面の「準備中」表示に使う） */
const missingTables = new Set<string>();
export function knownMissingTables(): string[] {
  return [...missingTables];
}

class SupabaseCollection<T extends { id: string }> implements Collection<T> {
  constructor(public readonly def: TableDef<T>) {}

  private map(r: Record<string, unknown>): T {
    const out: Record<string, unknown> = {};
    for (const [col, type] of Object.entries(this.def.cols) as [string, ColType][]) {
      out[col] = fromDb(type, r[snake(col)]);
    }
    return out as T;
  }

  private toRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined || !(k in this.def.cols)) continue;
      if (k === "id" && !v) continue;
      out[snake(k)] = toDb(v);
    }
    return out;
  }

  /** 失敗の扱い：テーブルが無いなら読むときは空・書くときは FeatureNotReadyError。それ以外はそのまま投げる */
  private fail(error: { code?: string; message?: string }, write: boolean): never | null {
    if (isMissingError(error)) {
      if (!missingTables.has(this.def.name)) {
        console.warn(`[collections] テーブル ${this.def.name} がまだありません（schema.sql の実行待ち）`);
        missingTables.add(this.def.name);
      }
      if (write) throw new FeatureNotReadyError(this.def.name);
      return null;
    }
    throw new Error(`[${this.def.name}] ${error.message ?? "データベースのエラー"}`);
  }

  // supabase-js の絞り込みは型が深いので、ここだけ any で受ける
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private applyWhere(query: any, where: Where<T> | undefined): any {
    if (!where) return query;
    let q = query;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      const col = snake(key);
      if (isOp(cond)) {
        if ("in" in cond) q = q.in(col, (cond.in as unknown[]).map(toDb));
        if ("neq" in cond) q = q.neq(col, toDb(cond.neq));
        if ("isNull" in cond) q = cond.isNull ? q.is(col, null) : q.not(col, "is", null);
        if ("gte" in cond && cond.gte !== undefined) q = q.gte(col, toDb(cond.gte));
        if ("gt" in cond && cond.gt !== undefined) q = q.gt(col, toDb(cond.gt));
        if ("lte" in cond && cond.lte !== undefined) q = q.lte(col, toDb(cond.lte));
        if ("lt" in cond && cond.lt !== undefined) q = q.lt(col, toDb(cond.lt));
      } else if (cond === null) {
        q = q.is(col, null);
      } else {
        q = q.eq(col, toDb(cond));
      }
    }
    return q;
  }

  async list(q: Query<T> = {}): Promise<T[]> {
    if (matchesNothing(q.where)) return [];
    const pageSize = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += pageSize) {
      let query: any = this.applyWhere(sb().from(this.def.name).select("*"), q.where);
      for (const [key, dir] of q.order ?? []) query = query.order(snake(key), { ascending: dir === "asc" });
      const size = q.limit ? Math.min(pageSize, q.limit - out.length) : pageSize;
      query = query.range(from, from + size - 1);
      const { data, error } = await query;
      if (error) return this.fail(error, false) ?? [];
      out.push(...(data as Record<string, unknown>[]).map((r) => this.map(r)));
      if ((data as unknown[]).length < size || (q.limit && out.length >= q.limit)) break;
    }
    return out;
  }

  async get(id: string): Promise<T | null> {
    if (!id) return null;
    const { data, error } = await sb().from(this.def.name).select("*").eq("id", id).maybeSingle();
    if (error) {
      // id の形が uuid でない（URLを直接書き換えた等）ときは「見つからない」
      if (error.code === "22P02") return null;
      return this.fail(error, false);
    }
    return data ? this.map(data as Record<string, unknown>) : null;
  }

  async find(where: Where<T>): Promise<T | null> {
    return (await this.list({ where, limit: 1 }))[0] ?? null;
  }

  async count(where?: Where<T>): Promise<number> {
    if (matchesNothing(where)) return 0;
    const { count, error } = await this.applyWhere(
      sb().from(this.def.name).select("id", { count: "exact", head: true }),
      where
    );
    if (error) return this.fail(error, false) ?? 0;
    return count ?? 0;
  }

  async insert(row: NewRow<T>): Promise<T> {
    const { data, error } = await sb().from(this.def.name).insert(this.toRow(row as Record<string, unknown>)).select().single();
    if (error) this.fail(error, true);
    return this.map(data as Record<string, unknown>);
  }

  async insertMany(rows: NewRow<T>[]): Promise<T[]> {
    if (rows.length === 0) return [];
    const out: T[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => this.toRow(r as Record<string, unknown>));
      const { data, error } = await sb().from(this.def.name).insert(chunk).select();
      if (error) this.fail(error, true);
      out.push(...(data as Record<string, unknown>[]).map((r) => this.map(r)));
    }
    return out;
  }

  async update(id: string, patch: Patch<T>): Promise<T | null> {
    const body = this.toRow(patch as Record<string, unknown>);
    delete body.id;
    if (Object.keys(body).length === 0) return this.get(id);
    const { data, error } = await sb().from(this.def.name).update(body).eq("id", id).select().maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      this.fail(error, true);
    }
    return data ? this.map(data as Record<string, unknown>) : null;
  }

  async updateWhere(where: Where<T>, patch: Patch<T>): Promise<number> {
    if (matchesNothing(where)) return 0;
    const body = this.toRow(patch as Record<string, unknown>);
    delete body.id;
    const { data, error } = await this.applyWhere(sb().from(this.def.name).update(body), where).select("id");
    if (error) this.fail(error, true);
    return (data as unknown[] | null)?.length ?? 0;
  }

  async remove(id: string): Promise<void> {
    const { error } = await sb().from(this.def.name).delete().eq("id", id);
    if (error && error.code !== "22P02") this.fail(error, true);
  }

  async removeWhere(where: Where<T>): Promise<number> {
    if (matchesNothing(where)) return 0;
    const { data, error } = await this.applyWhere(sb().from(this.def.name).delete(), where).select("id");
    if (error) this.fail(error, true);
    return (data as unknown[] | null)?.length ?? 0;
  }

  async upsert(row: NewRow<T>, keys: (keyof T & string)[]): Promise<T> {
    const body = this.toRow(row as Record<string, unknown>);
    delete body.created_at;
    const { data, error } = await sb()
      .from(this.def.name)
      .upsert(body, { onConflict: keys.map(snake).join(",") })
      .select()
      .single();
    if (error) this.fail(error, true);
    return this.map(data as Record<string, unknown>);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ---------------------------------------------------------------- 入口

const cache = new Map<string, Collection<{ id: string }>>();

/** テーブルの定義から、読み書きの入口を返す（Supabase設定済みなら本番DB、未設定ならメモリ内） */
export function collection<T extends { id: string }>(def: TableDef<T>): Collection<T> {
  const key = `${isSupabaseConfigured() ? "sb" : "mem"}:${def.name}`;
  let c = cache.get(key);
  if (!c) {
    c = isSupabaseConfigured()
      ? (new SupabaseCollection(def) as unknown as Collection<{ id: string }>)
      : (new MemoryCollection(def) as unknown as Collection<{ id: string }>);
    cache.set(key, c);
  }
  return c as unknown as Collection<T>;
}

/**
 * そのテーブルが使えるか（本番DBで schema.sql を流す前は false）。画面の「準備中」表示に使う。
 * デモモードでは常に true。
 */
export async function tableReady(def: TableDef<{ id: string }>): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  const { error } = await sb().from(def.name).select("id", { head: true, count: "exact" }).limit(1);
  if (!error) {
    missingTables.delete(def.name);
    return true;
  }
  if (isMissingError(error)) {
    missingTables.add(def.name);
    return false;
  }
  return true;
}

/** テスト用：メモリ内のデータを消して、デモデータを入れ直せるようにする */
export function resetMemoryCollections(opts: { seed?: boolean } = {}): void {
  g.__eryesCollections = new Map();
  g.__eryesCollectionsSeed = opts.seed === false ? Promise.resolve() : undefined;
}
