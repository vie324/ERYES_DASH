import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LIFF（LINEアプリ内ブラウザ）から開くページがあるため X-Frame-Options は付けない
  poweredByHeader: false,
  // AIしもんのプロンプト・知識ファイル（ai-shimon/）は実行時に fs で読むので、Vercel の関数に同梱する
  outputFileTracingIncludes: {
    "/api/ai-shimon/chat": ["./ai-shimon/**/*"],
    "/admin/settings": ["./ai-shimon/**/*"],
  },
  // 旧「シフト管理（早番・遅番）」の画面は、シフト（/staff/schedule・/admin/schedule）に一本化した。
  // ブックマークや古いお知らせのリンクから来ても迷わないよう転送する（?month= などはそのまま引き継がれる）
  async redirects() {
    return [
      { source: "/staff/shift", destination: "/staff/schedule", permanent: false },
      { source: "/staff/shift/all", destination: "/staff/schedule?view=store", permanent: false },
      { source: "/staff/shift/request", destination: "/staff/schedule/dayoff", permanent: false },
      { source: "/admin/shift", destination: "/admin/schedule", permanent: false },
      { source: "/admin/shift/board", destination: "/admin/schedule", permanent: false },
      { source: "/admin/shift/settings", destination: "/admin/schedule/settings", permanent: false },
    ];
  },
};

export default nextConfig;
