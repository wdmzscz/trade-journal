-- Trade Journal 云端数据库结构
-- 在 Supabase Dashboard → SQL Editor 中运行此脚本

-- 账户配置
create table if not exists account_profiles (
  user_id uuid references auth.users on delete cascade not null,
  account_id text not null,
  label text not null,
  type text not null check (type in ('futures', 'stock', 'other')),
  created_at timestamptz not null default now(),
  starting_capital numeric,
  current_capital numeric,
  total_deposits numeric,
  total_withdrawals numeric,
  cash_flows jsonb default '[]',
  primary key (user_id, account_id)
);

-- 交易记录
create table if not exists trades (
  id uuid primary key,
  user_id uuid references auth.users on delete cascade not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  status text not null check (status in ('open', 'closed')),
  asset_class text,
  entry_date timestamptz not null,
  exit_date timestamptz,
  entry_price numeric not null,
  exit_price numeric,
  quantity numeric not null,
  fees numeric not null default 0,
  pnl numeric not null default 0,
  r_multiple numeric,
  setup text,
  tags jsonb not null default '[]',
  notes text,
  account text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists trades_user_id_idx on trades (user_id);
create index if not exists trades_user_account_idx on trades (user_id, account);

-- 交易日记
create table if not exists journal_entries (
  id uuid primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  account text not null,
  mood text,
  market_condition text,
  pre_market_plan text,
  post_market_review text,
  lessons text,
  goals text,
  rating int,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, account, date)
);

create index if not exists journal_entries_user_id_idx on journal_entries (user_id);

-- Row Level Security
alter table account_profiles enable row level security;
alter table trades enable row level security;
alter table journal_entries enable row level security;

create policy "Users manage own account_profiles"
  on account_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own trades"
  on trades for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own journal_entries"
  on journal_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime（跨设备实时同步）
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table journal_entries;
alter publication supabase_realtime add table account_profiles;

-- 已有数据库升级（若之前已运行过旧版 schema，在 SQL Editor 执行以下语句）
alter table account_profiles add column if not exists starting_capital numeric;
alter table account_profiles add column if not exists current_capital numeric;
alter table account_profiles add column if not exists total_deposits numeric;
alter table account_profiles add column if not exists total_withdrawals numeric;
alter table account_profiles add column if not exists cash_flows jsonb default '[]';
