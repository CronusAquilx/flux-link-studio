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
  if new.role_arn <> '' and new.role_arn !~ '^arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]{1,512}$' then
    raise exception 'Role ARN must look like arn:aws:iam::123456789012:role/Name';
  end if;
  return new;
end $$;