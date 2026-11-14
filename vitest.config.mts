// テスト（vitest）の設定。`npm test` で実行する。
// 画面（Next.js）は起動せず、lib 以下の判定ロジックとデモ用のデータストアを直接たたく。
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Supabase の環境変数が入っていても、テストは必ずメモリ内のデモデータで動かす
    env: { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  },
});
