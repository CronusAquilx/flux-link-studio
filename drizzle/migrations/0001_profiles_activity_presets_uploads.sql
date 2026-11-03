create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  company text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert on public.activity to authenticated;
grant all on public.activity to service_role;
alter table public.activity enable row level security;
create policy "own activity read" on public.activity for select to authenticated using (auth.uid() = user_id);
create policy "own activity insert" on public.activity for insert to authenticated with check (auth.uid() = user_id);

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  link_kind text not null default 'flux_mini' check (link_kind in ('flux_v3','flux_mini')),
  expires_days integer,
  key_prefix text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.presets to authenticated;
grant all on public.presets to service_role;
alter table public.presets enable row level security;
create policy "own presets" on public.presets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  bucket_id uuid not null references public.buckets(id) on delete cascade,
  object_key text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.uploads to authenticated;
grant all on public.uploads to service_role;
alter table public.uploads enable row level security;
create policy "own uploads" on public.uploads for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.links add column label text;
alter table public.projects add column disabled boolean not null default false;