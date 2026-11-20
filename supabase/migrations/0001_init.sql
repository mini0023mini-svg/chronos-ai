-- ============================================================================
-- CHRONOS AI — Initial Migration (0001_init.sql)
-- 目标：PostgreSQL 15+ (Supabase)。全部表启用 RLS，按 user_id 严格隔离。
-- 时区：所有时间列使用 timestamptz；业务显示时区记录在 timezone 列，默认 Asia/Singapore。
-- 运行方式：Supabase SQL Editor 粘贴执行，或 supabase db push。
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 通用触发器：自动维护 updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.attach_updated_at(p_table text)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists trg_%1$s_updated on public.%1$s;', p_table);
  execute format(
    'create trigger trg_%1$s_updated before update on public.%1$s
     for each row execute function public.set_updated_at();', p_table
  );
end;
$$;

-- 1) profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  language text not null default 'zh-CN' check (language in ('zh-CN','en-US')),
  theme text not null default 'light' check (theme in ('light','dark','system')),
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('profiles');

-- 2) categories（每用户 6 个默认分类，由触发器初始化）
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#829CC4',
  icon text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)
);
select public.attach_updated_at('categories');

-- 3) recurring_rules（与实例分离）
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  freq text not null check (freq in ('daily','weekly','monthly','yearly')),
  interval integer not null default 1 check (interval > 0),
  by_weekday integer[],
  by_month_day integer,
  start_date date not null,
  end_date date,
  count integer,
  timezone text not null default 'Asia/Singapore',
  superseded_by uuid references public.recurring_rules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('recurring_rules');

-- 4) events（三范围修改：is_exception/original_event_id/is_cancelled/occurrence_date）
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  category_id uuid references public.categories(id) on delete set null,
  calendar_key text not null default 'default',
  recurrence_rule_id uuid references public.recurring_rules(id) on delete cascade,
  original_event_id uuid references public.events(id) on delete cascade,
  is_exception boolean not null default false,
  is_cancelled boolean not null default false,
  occurrence_date date,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_event_time check (end_at >= start_at)
);
select public.attach_updated_at('events');

-- 5) tasks（parent_task_id 自引用子任务）
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  category_id uuid references public.categories(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  estimated_minutes integer,
  due_at timestamptz,
  remind_at timestamptz,
  is_completed boolean not null default false,
  completed_at timestamptz,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('tasks');

-- 6) deadlines（颜色由视图层按 status/due_at 计算）
create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz not null,
  status text not null default 'not_started'
    check (status in ('not_started','normal','soon','overdue','finished')),
  custom_reminder_at timestamptz,
  category_id uuid references public.categories(id) on delete set null,
  related_task_id uuid references public.tasks(id) on delete set null,
  related_event_id uuid references public.events(id) on delete set null,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('deadlines');

-- 7) imports（文件存私有桶 imports）
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('jpg','png','pdf','docx','xlsx','txt','paste')),
  file_path text,
  raw_text text,
  status text not null default 'pending' check (status in ('pending','preview','confirmed','failed')),
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('imports');

-- 8) import_items（识别候选，确认后写入正式表）
create table if not exists public.import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references public.imports(id) on delete cascade,
  item_type text not null check (item_type in ('event','task','deadline')),
  payload jsonb not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  needs_confirm boolean not null default true,
  is_duplicate boolean not null default false,
  has_conflict boolean not null default false,
  missing_date boolean not null default false,
  confirmed boolean not null default false,
  target_id uuid,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('import_items');

-- 9) notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  payload jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  channel text not null default 'in_app' check (channel in ('in_app','system','push')),
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('notifications');

-- 10) ai_conversations（pending_actions 为确认闸门）
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  messages jsonb not null default '[]'::jsonb,
  pending_actions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('ai_conversations');

-- 11) activity_logs
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
select public.attach_updated_at('activity_logs');

-- 索引
create index if not exists idx_events_user_start on public.events(user_id,start_at) where deleted_at is null;
create index if not exists idx_events_user_rule on public.events(user_id,recurrence_rule_id);
create index if not exists idx_events_user_original on public.events(user_id,original_event_id);
create index if not exists idx_tasks_user_due on public.tasks(user_id,due_at) where deleted_at is null;
create index if not exists idx_tasks_user_parent on public.tasks(user_id,parent_task_id);
create index if not exists idx_deadlines_user_due on public.deadlines(user_id,due_at) where deleted_at is null;
create index if not exists idx_notifications_user_unread on public.notifications(user_id,is_read) where deleted_at is null;
create index if not exists idx_activity_user_created on public.activity_logs(user_id,created_at desc);
create index if not exists idx_import_items_import on public.import_items(user_id,import_id);
create index if not exists idx_recurring_user on public.recurring_rules(user_id) where deleted_at is null;

-- RLS：全部启用 + 每表 4 条策略
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.deadlines enable row level security;
alter table public.imports enable row level security;
alter table public.import_items enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.activity_logs enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','categories','recurring_rules','events','tasks',
    'deadlines','imports','import_items','notifications','ai_conversations','activity_logs'] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$s;', t);
    execute format('create policy %1$s_select_own on public.%1$s for select to authenticated using (auth.uid() = user_id);', t);
    execute format('drop policy if exists %1$s_insert_own on public.%1$s;', t);
    execute format('create policy %1$s_insert_own on public.%1$s for insert to authenticated with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists %1$s_update_own on public.%1$s;', t);
    execute format('create policy %1$s_update_own on public.%1$s for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists %1$s_delete_own on public.%1$s;', t);
    execute format('create policy %1$s_delete_own on public.%1$s for delete to authenticated using (auth.uid() = user_id);', t);
  end loop;
end $$;
-- 软删除通过 UPDATE deleted_at 实现，DELETE 策略保留用于物理清理。

-- 新用户自动建 profile + 6 默认分类
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id,user_id,display_name)
  values (new.id,new.id,coalesce(new.raw_user_meta_data->>'display_name','用户'));
  insert into public.categories (user_id,name,color,is_default,sort_order) values
    (new.id,'Study','#829CC4',true,1),
    (new.id,'Work','#A0BDA7',true,2),
    (new.id,'Personal','#E8C77B',true,3),
    (new.id,'Exercise','#D98C8C',true,4),
    (new.id,'Life','#B4A7D9',true,5),
    (new.id,'Other','#8B9099',true,6);
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage：私有桶 imports，文件按 {user_id}/ 前缀隔离
insert into storage.buckets (id,name,public) values ('imports','imports',false) on conflict (id) do nothing;
drop policy if exists "imports_select_own" on storage.objects;
create policy "imports_select_own" on storage.objects for select to authenticated
  using (bucket_id='imports' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "imports_insert_own" on storage.objects;
create policy "imports_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id='imports' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "imports_update_own" on storage.objects;
create policy "imports_update_own" on storage.objects for update to authenticated
  using (bucket_id='imports' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='imports' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "imports_delete_own" on storage.objects;
create policy "imports_delete_own" on storage.objects for delete to authenticated
  using (bucket_id='imports' and (storage.foldername(name))[1]=auth.uid()::text);

-- ============================================================================
-- 完成。后续迁移（Phase 4 重复实例例外、Phase 8 通知）以 0002_xxx.sql 追加。
-- ============================================================================
