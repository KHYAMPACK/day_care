-- Parents can record the aydınlatma themselves (Vite/local has no Vercel /api).
-- accepted_at is always server time; client-supplied IP is not trusted here.

create or replace function public.legal_acceptances_stamp()
returns trigger
language plpgsql
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.user_id := auth.uid();
    new.accepted_at := now();
    new.ip_address := null;
  end if;
  return new;
end;
$$;

drop trigger if exists legal_acceptances_stamp on public.legal_acceptances;

create trigger legal_acceptances_stamp
  before insert or update on public.legal_acceptances
  for each row execute function public.legal_acceptances_stamp();

drop policy if exists "Parents can insert own legal acceptances" on public.legal_acceptances;
drop policy if exists "Parents can update own legal acceptances" on public.legal_acceptances;

create policy "Parents can insert own legal acceptances"
  on public.legal_acceptances
  for insert
  to authenticated
  with check (user_id = auth.uid() and not public.is_staff());

create policy "Parents can update own legal acceptances"
  on public.legal_acceptances
  for update
  to authenticated
  using (user_id = auth.uid() and not public.is_staff())
  with check (user_id = auth.uid() and not public.is_staff());

grant insert, update on public.legal_acceptances to authenticated;
