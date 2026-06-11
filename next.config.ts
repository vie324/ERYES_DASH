import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LIFF（LINEアプリ内ブラウザ）から開くページがあるため X-Frame-Options は付けない
  poweredByHeader: false,
};

export default nextConfig;
