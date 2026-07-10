create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  chinese text not null,
  pinyin text not null,
  meaning text not null,
  created_at timestamptz default now() not null
);

alter table words enable row level security;

create policy "Users can read own words"
on words for select
using (auth.uid() = user_id);

create policy "Users can insert own words"
on words for insert
with check (auth.uid() = user_id);

create policy "Users can update own words"
on words for update
using (auth.uid() = user_id);

create policy "Users can delete own words"
on words for delete
using (auth.uid() = user_id);
