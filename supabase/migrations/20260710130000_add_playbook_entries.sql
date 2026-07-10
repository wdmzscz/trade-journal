create table if not exists playbook_entries (
  id uuid primary key,
  user_id uuid references auth.users on delete cascade not null,
  trade_id uuid,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  account text not null,
  entry_date timestamptz not null,
  exit_date timestamptz,
  entry_price numeric not null default 0,
  exit_price numeric,
  pnl numeric,
  setup text,
  title text not null,
  thesis text,
  lessons text,
  journal_date date,
  charts jsonb not null default '[]',
  tags jsonb not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists playbook_entries_user_id_idx on playbook_entries (user_id);
create index if not exists playbook_entries_user_account_idx on playbook_entries (user_id, account);

alter table playbook_entries enable row level security;

create policy "Users manage own playbook_entries"
  on playbook_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table trades add column if not exists entry_charts jsonb default '[]';
alter table trades add column if not exists playbook_id text;
