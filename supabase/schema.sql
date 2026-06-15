-- ============================================================
-- EREYS DASH データベーススキーマ（Supabase / PostgreSQL）
-- 適用方法：Supabaseダッシュボード → SQL Editor → このファイルの内容を貼り付けて実行
-- ============================================================

-- ---- テーブル定義 ----

-- 店舗マスタ（1店舗運用を前提とするが、複数店舗も登録可能な設計）
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  lat double precision not null,
  lng double precision not null,
  gps_radius_m integer not null default 100,          -- GPS打刻の許容半径（m）
  attendance_enabled boolean not null default true,   -- 勤怠運用ON/OFF（任意運用）
  created_at timestamptz not null default now()
);

-- スタッフマスタ（ログイン情報を含む。パスワードはscryptハッシュ）
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name text not null,
  login_id text not null unique,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  fixed_overtime_hours integer not null default 20,   -- 固定残業時間（月）
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 顧客（LINE友だち追加時に自動登録）
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  full_name text not null,
  created_at timestamptz not null default now()
);

-- カウンセリング回答（項目可変のためJSONBで保存）
create table if not exists counseling_responses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed')), -- 未確認/確認済み
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references staff(id),
  confirmed_at timestamptz
);

-- 日報（スタッフ×日付でユニーク。再保存は上書き）
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  report_date date not null,
  new_clients integer not null default 0,
  repeat_clients integer not null default 0,
  next_bookings integer not null default 0,
  service_sales integer not null default 0,
  option_sales integer not null default 0,
  retail_sales integer not null default 0,
  memo text not null default '',
  created_at timestamptz not null default now(),
  unique (staff_id, report_date)
);

-- レジ締め・現金管理（店舗×日付でユニーク。スタッフ個人の日報とは別レコード）
create table if not exists cash_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  report_date date not null,
  cash_sales integer not null default 0,       -- 本日の現金売上高
  register_balance integer not null default 0, -- レジ現金残高（締め時点）
  moved_to_safe integer not null default 0,    -- 金庫へ移動額
  change_fund integer not null default 0,      -- レジおつり金の残高（翌日のおつり準備金）
  safe_balance integer not null default 0,     -- 金庫現金残高
  bank_deposit integer not null default 0,     -- 銀行への預入額
  memo text not null default '',
  created_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  unique (store_id, report_date)
);

-- 勤怠打刻（圏外打刻も監査用に is_valid=false で記録。集計対象は true のみ）
create table if not exists attendances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  punch_type text not null check (punch_type in ('in', 'out')),
  punched_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  distance_m double precision not null,
  is_valid boolean not null
);

-- 次回予約（前日リマインドの対象。reminder_sent_at で二重送信を防止）
create table if not exists next_appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  scheduled_at timestamptz not null,
  staff_id uuid references staff(id),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- 一斉配信の履歴
create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid not null references staff(id),
  body text not null,
  sent_at timestamptz not null default now(),
  recipient_count integer not null default 0
);

-- ============================================================
-- シフト管理（3店舗の勤務を一元管理）
-- ============================================================

-- シフトルール（1行のみ。管理者画面から変更）
create table if not exists shift_rules (
  id integer primary key default 1 check (id = 1),
  max_consecutive_days integer not null default 5,          -- 連勤上限
  min_staff_per_store_per_day integer not null default 2,   -- 各店舗・各日の最低人数（日単位）
  request_deadline_day integer not null default 25          -- 希望締切＝対象月の前月◯日
);

-- シフト希望（月単位：備考・提出日時）
create table if not exists shift_request_months (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  note text not null default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, target_month)
);

-- シフト希望（日単位）。行が無い日は「指定なし＝早遅どちらでも可」
create table if not exists shift_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  date date not null,
  preference text not null check (preference in ('early', 'late', 'off')),
  unique (staff_id, date)
);

-- その月に勤務可能な店舗（複数選択）
create table if not exists staff_available_stores (
  staff_id uuid not null references staff(id),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  store_id uuid not null references stores(id),
  primary key (staff_id, target_month, store_id)
);

-- シフト割当（1スタッフ1日1件。draft=下書き/confirmed=確定・公開）
create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),
  date date not null,
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  shift_type text not null check (shift_type in ('early', 'late')),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

-- ---- インデックス ----
create index if not exists idx_counseling_status on counseling_responses (status, submitted_at desc);
create index if not exists idx_counseling_customer on counseling_responses (customer_id);
create index if not exists idx_reports_date on daily_reports (report_date);
create index if not exists idx_reports_staff_date on daily_reports (staff_id, report_date);
create index if not exists idx_cash_reports_date on cash_reports (report_date);
create index if not exists idx_attendances_punched on attendances (punched_at);
create index if not exists idx_attendances_staff on attendances (staff_id, punched_at);
create index if not exists idx_appointments_scheduled on next_appointments (scheduled_at);
create index if not exists idx_appointments_reminder on next_appointments (reminder_sent_at, scheduled_at);
create index if not exists idx_shift_requests_month on shift_requests (target_month);
create index if not exists idx_shift_available_month on staff_available_stores (target_month);
create index if not exists idx_shift_assignments_month on shift_assignments (target_month, date);

-- ---- Row Level Security ----
-- 本システムはサーバー側からサービスロールキーのみで接続する構成のため、
-- 全テーブルでRLSを有効化し、ポリシーは作成しない（＝anonキーからは一切アクセス不可）。
alter table stores enable row level security;
alter table staff enable row level security;
alter table customers enable row level security;
alter table counseling_responses enable row level security;
alter table daily_reports enable row level security;
alter table cash_reports enable row level security;
alter table attendances enable row level security;
alter table next_appointments enable row level security;
alter table broadcasts enable row level security;
alter table shift_rules enable row level security;
alter table shift_request_months enable row level security;
alter table shift_requests enable row level security;
alter table staff_available_stores enable row level security;
alter table shift_assignments enable row level security;

-- ---- 初期データ（重複しないようガード付き。何度実行しても安全）----
-- TODO: 店舗名・住所・緯度経度は実際の値に書き換える。最初の行が「本店」扱い。
--       店舗を1件でも登録済みの場合、この insert はスキップされます（重複防止）。
insert into stores (name, address, lat, lng, gps_radius_m, attendance_enabled)
select v.name, v.address, v.lat, v.lng, v.gps_radius_m, v.attendance_enabled
from (values
  ('EREYS 自由が丘店', '東京都目黒区自由が丘1-14-14', 35.608614, 139.670152, 100, true),
  ('ENi 自由が丘店',   '東京都目黒区自由が丘1-14-14', 35.608614, 139.670152, 100, true)
) as v(name, address, lat, lng, gps_radius_m, attendance_enabled)
where not exists (select 1 from stores);

-- シフトルールの初期値（連勤上限5日・各店舗2名・締切は前月25日）
insert into shift_rules (id) values (1)
on conflict (id) do nothing;

-- 初期管理者アカウント
--   ログインID: admin ／ パスワード: admin1234
--   ※ 運用開始前に必ず管理画面（マスタ設定）からパスワードを変更すること。
--   別のパスワードでハッシュを作る場合: npm run hash-password -- '新しいパスワード'
insert into staff (store_id, name, login_id, password_hash, role, fixed_overtime_hours)
select
  id,
  '管理者',
  'admin',
  'scrypt$16384$8$1$Wr6MznwmDmuZvXdeyeJaHg==$5F175uSYVZMjfLV0px9t75y2ONErZ27gGktSY8nvLto=',
  'admin',
  20
from stores
order by created_at, name
limit 1
on conflict (login_id) do nothing;
