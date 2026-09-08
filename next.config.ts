import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LIFF（LINEアプリ内ブラウザ）から開くページがあるため X-Frame-Options は付けない
  poweredByHeader: false,
  // AIしもんのプロンプト・知識ファイル（ai-shimon/）は実行時に fs で読むので、Vercel の関数に同梱する
  outputFileTracingIncludes: {
    "/api/ai-shimon/chat": ["./ai-shimon/**/*"],
    "/admin/settings": ["./ai-shimon/**/*"],
  },
};

export default nextConfig;
