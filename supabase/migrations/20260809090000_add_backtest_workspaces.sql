-- Isolated backtesting workspace (does not touch live trades / IBKR data)
create table if not exists public.backtest_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.backtest_workspaces enable row level security;

drop policy if exists "Users manage own backtest_workspaces" on public.backtest_workspaces;
create policy "Users manage own backtest_workspaces"
  on public.backtest_workspaces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
