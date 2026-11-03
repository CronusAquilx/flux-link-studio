-- Fix: saving a Role ARN on the Connections page failed with
--   "invalid regular expression: invalid repetition count(s)".
-- Cause: the aws_connections guard trigger validated role_arn with
--   ^arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]{1,512}$
-- PostgreSQL's regex engine caps a repetition count at 255, so {1,512} is not a
-- valid pattern and every INSERT/UPDATE touching role_arn raised.
-- Fix: same shape with an unbounded +, and the 512-character cap enforced by char_length().
create or replace function public.aws_connections_guard()
 returns trigger language plpgsql set search_path = public as $function$
declare trusted boolean := coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres','service_role','supabase_admin');
begin
  if tg_op = 'INSERT' then
    new.external_id := public.flux_random_hex();
    new.status := 'pending';
    new.aws_account_id := null;
    new.verified_at := null;
    new.last_error := null;
  else
    new.external_id := old.external_id;
    new.user_id := old.user_id;
    new.id := old.id;
    if not trusted then
      new.status := old.status;
      new.aws_account_id := old.aws_account_id;
      new.verified_at := old.verified_at;
      new.last_error := old.last_error;
    end if;
    if new.role_arn is distinct from old.role_arn then
      new.status := 'pending'; new.verified_at := null; new.aws_account_id := null;
    end if;
  end if;
  if new.role_arn <> '' and (
       char_length(new.role_arn) > 512
       or new.role_arn !~ '^arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+$'
     ) then
    raise exception 'Role ARN must look like arn:aws:iam::123456789012:role/Name';
  end if;
  return new;
end $function$;