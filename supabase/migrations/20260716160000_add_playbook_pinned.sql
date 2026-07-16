alter table playbook_entries add column if not exists pinned boolean not null default false;
