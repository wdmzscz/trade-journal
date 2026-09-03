-- Playbook 案例需要进入 realtime，否则对端只会在整页刷新时才看到新案例
do $$
begin
  alter publication supabase_realtime add table playbook_entries;
exception
  when duplicate_object then null;
end $$;
