-- 每日净资产历史（Calendar 收益率分母）
alter table account_profiles add column if not exists nav_history jsonb default '[]';
