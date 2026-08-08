-- Playbook: win / loss outcome for good & bad trade reviews
alter table public.playbook_entries
  add column if not exists outcome text;

alter table public.playbook_entries
  drop constraint if exists playbook_entries_outcome_check;

alter table public.playbook_entries
  add constraint playbook_entries_outcome_check
  check (outcome is null or outcome in ('win', 'loss', 'breakeven'));

-- Backfill from existing pnl snapshots
update public.playbook_entries
set outcome = case
  when pnl > 0 then 'win'
  when pnl < 0 then 'loss'
  when pnl = 0 then 'breakeven'
  else outcome
end
where outcome is null and pnl is not null;
