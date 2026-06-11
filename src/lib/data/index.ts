// データストアの入口。Supabase設定済みなら本番DB、未設定ならデモ用メモリ内データを使う。

import { isSupabaseConfigured } from "@/lib/env";
import { getMockStore } from "@/lib/data/mock-store";
import { getSupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore } from "@/lib/data/types";

export function getDataStore(): DataStore {
  return isSupabaseConfigured() ? getSupabaseStore() : getMockStore();
}

/** デモモード（Supabase未設定）かどうか。画面上のバナー表示などに使う */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}
