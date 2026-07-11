create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now() not null,
  unique (user_id, name)
);

create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  folder_id uuid references folders(id) on delete set null,
  chinese text not null,
  pinyin text not null,
  meaning text not null,
  memorized boolean default false not null,
  created_at timestamptz default now() not null
);

alter table words
add column if not exists memorized boolean default false not null;

alter table words
add column if not exists folder_id uuid references folders(id) on delete set null;

alter table folders enable row level security;
alter table words enable row level security;

drop policy if exists "Users can read own folders" on folders;
create policy "Users can read own folders"
on folders for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own folders" on folders;
create policy "Users can insert own folders"
on folders for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own folders" on folders;
create policy "Users can update own folders"
on folders for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own folders" on folders;
create policy "Users can delete own folders"
on folders for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own words" on words;
create policy "Users can read own words"
on words for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own words" on words;
create policy "Users can insert own words"
on words for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own words" on words;
create policy "Users can update own words"
on words for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own words" on words;
create policy "Users can delete own words"
on words for delete
using (auth.uid() = user_id);
