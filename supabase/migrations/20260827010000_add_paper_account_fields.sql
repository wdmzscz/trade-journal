-- Paper accounts + simplified paper trade fields
alter table public.account_profiles
  add column if not exists is_paper boolean not null default false;

alter table public.trades
  add column if not exists max_rr numeric;

alter table public.trades
  add column if not exists stop_loss numeric;
