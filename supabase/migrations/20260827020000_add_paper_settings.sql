-- Paper account analysis settings (balance stays on starting_capital / total_deposits)
alter table public.account_profiles
  add column if not exists paper_settings jsonb not null default '{}'::jsonb;
