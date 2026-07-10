alter table trades add column if not exists entry_charts jsonb default '[]';
alter table trades add column if not exists playbook_id text;
