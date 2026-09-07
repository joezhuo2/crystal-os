-- Crystal OS: authentication and per-user isolation.
--
-- Every table carries user_id with `default auth.uid()`, so the client never
-- sends it and the existing mapper functions in src/contexts/AppContext.tsx
-- stay unchanged. RLS is enabled on all five tables with four policies each.
--
-- Column names and types are recovered from those mappers. Confirm them against
-- the previous project before deleting it:
--
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--   order by table_name, ordinal_position;

create extension if not exists "pgcrypto";

-- ── Categories (created first; tasks/transactions reference them) ──

create table public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at timestamptz not null default now()
);

create table public.financial_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at timestamptz not null default now()
);

-- ── Tasks ──

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  start_date  date,
  start_time  text,
  end_date    date,
  end_time    text,
  priority    text not null default 'medium',
  -- set null, never cascade: deleting a category must not delete its tasks.
  category_id uuid references public.task_categories(id) on delete set null,
  completed   boolean not null default false,
  repeat_days integer,
  created_at  timestamptz not null default now()
);

-- ── Transactions ──

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null,
  type        text not null check (type in ('income', 'expense')),
  category_id uuid references public.financial_categories(id) on delete set null,
  date        date not null,
  created_at  timestamptz not null default now()
);

-- ── Settings ──
-- No surrogate id: the natural key is (user_id, key), and `key` alone would
-- collide across users.

create table public.settings (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── Indexes ──

create index tasks_user_id_idx                on public.tasks (user_id);
create index transactions_user_id_idx         on public.transactions (user_id);
create index task_categories_user_id_idx      on public.task_categories (user_id);
create index financial_categories_user_id_idx on public.financial_categories (user_id);

-- ── Row Level Security ──
-- `using` decides which rows an operation can see; `with check` decides what a
-- row may look like afterwards. Update needs both, or a row's user_id could be
-- rewritten to hand it to another account.

alter table public.tasks                enable row level security;
alter table public.transactions         enable row level security;
alter table public.task_categories      enable row level security;
alter table public.financial_categories enable row level security;
alter table public.settings             enable row level security;

create policy tasks_select_own on public.tasks
  for select using (auth.uid() = user_id);
create policy tasks_insert_own on public.tasks
  for insert with check (auth.uid() = user_id);
create policy tasks_update_own on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_delete_own on public.tasks
  for delete using (auth.uid() = user_id);

create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

create policy task_categories_select_own on public.task_categories
  for select using (auth.uid() = user_id);
create policy task_categories_insert_own on public.task_categories
  for insert with check (auth.uid() = user_id);
create policy task_categories_update_own on public.task_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy task_categories_delete_own on public.task_categories
  for delete using (auth.uid() = user_id);

create policy financial_categories_select_own on public.financial_categories
  for select using (auth.uid() = user_id);
create policy financial_categories_insert_own on public.financial_categories
  for insert with check (auth.uid() = user_id);
create policy financial_categories_update_own on public.financial_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy financial_categories_delete_own on public.financial_categories
  for delete using (auth.uid() = user_id);

create policy settings_select_own on public.settings
  for select using (auth.uid() = user_id);
create policy settings_insert_own on public.settings
  for insert with check (auth.uid() = user_id);
create policy settings_update_own on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy settings_delete_own on public.settings
  for delete using (auth.uid() = user_id);
