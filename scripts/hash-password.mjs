#!/usr/bin/env node
// パスワードハッシュ生成ツール（Supabaseへ直接スタッフを登録する場合などに使用）
// 使い方: npm run hash-password -- 'パスワード文字列'

import { randomBytes, scryptSync } from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("使い方: npm run hash-password -- 'パスワード文字列'");
  process.exit(1);
}
if (password.length < 8) {
  console.error("パスワードは8文字以上にしてください");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
console.log(`scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`);
