create or replace function public.flux_random_hex() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
$$;

create table public.aws_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  label text not null,
  role_arn text not null,
  external_id text not null default public.flux_random_hex() unique,
  region text not null default 'us-east-1',
  status text not null default 'pending',
  aws_account_id text,
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.aws_connections to authenticated;
grant all on public.aws_connections to service_role;
alter table public.aws_connections enable row level security;
create policy "own connections" on public.aws_connections for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.aws_connections_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.external_id := public.flux_random_hex();
    new.status := 'pending';
    new.aws_account_id := null;
    new.verified_at := null;
  else
    new.external_id := old.external_id;
    new.user_id := old.user_id;
    if new.role_arn is distinct from old.role_arn then
      new.status := 'pending'; new.verified_at := null; new.aws_account_id := null;
    end if;
  end if;
  if new.role_arn !~ '^arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]{1,512}$' then
    raise exception 'Role ARN must look like arn:aws:iam::123456789012:role/Name';
  end if;
  return new;
end $$;
create trigger aws_connections_guard before insert or update on public.aws_connections for each row execute function public.aws_connections_guard();

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  connection_id uuid not null references public.aws_connections(id) on delete cascade,
  name text not null,
  region text not null,
  provisioned_by_flux boolean not null default false,
  browser_uploads boolean not null default false,
  discovered_at timestamptz not null default now(),
  unique (user_id, name)
);
grant select, insert, update, delete on public.buckets to authenticated;
grant all on public.buckets to service_role;
alter table public.buckets enable row level security;
create policy "own buckets" on public.buckets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  slug text not null unique,
  kind text not null check (kind in ('flux_v3','flux_mini')),
  source text not null check (source in ('s3','project')),
  bucket_id uuid references public.buckets(id) on delete cascade,
  object_key text,
  target_url text,
  sign_seconds integer not null default 300,
  expires_at timestamptz,
  revoked boolean not null default false,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.links to authenticated;
grant all on public.links to service_role;
alter table public.links enable row level security;
create policy "own links" on public.links for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  bucket_id uuid not null references public.buckets(id) on delete cascade,
  prefix text not null default '',
  link_kind text not null default 'flux_mini' check (link_kind in ('flux_v3','flux_mini')),
  expires_days integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.automation_rules to authenticated;
grant all on public.automation_rules to service_role;
alter table public.automation_rules enable row level security;
create policy "own rules" on public.automation_rules for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  lovable_url text not null,
  link_id uuid references public.links(id) on delete set null,
  last_check_status integer,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "own projects" on public.projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.assistant_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  prompt text not null,
  summary text not null default '',
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assistant_plans to authenticated;
grant all on public.assistant_plans to service_role;
alter table public.assistant_plans enable row level security;
create policy "own plans" on public.assistant_plans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);