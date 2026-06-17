-- School invite codes for self-service parent/teacher onboarding

-- ---------------------------------------------------------------------------
-- 1. school_code column
-- ---------------------------------------------------------------------------

alter table public.schools
  add column if not exists school_code text;

create unique index if not exists schools_school_code_unique_idx
  on public.schools (school_code)
  where school_code is not null;

-- ---------------------------------------------------------------------------
-- 2. Code generation helpers
-- ---------------------------------------------------------------------------

create or replace function public.transliterate_tr_to_ascii(p_text text)
returns text
language sql
immutable
as $$
  select upper(
    translate(
      coalesce(p_text, ''),
      'ıİğĞüÜşŞöÖçÇ',
      'iIGGUUSsoOCc'
    )
  );
$$;

create or replace function public.school_name_to_code_base(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_words text[];
  v_longest text := '';
  v_w text;
  v_clean text;
  v_skip constant text[] := array[
    'kreş', 'kres', 'okul', 'anaokulu', 'akademi', 'ilk', 'the', 've', 'and'
  ];
begin
  v_words := regexp_split_to_array(lower(trim(coalesce(p_name, ''))), '\s+');

  foreach v_w in array v_words loop
    if v_w = any (v_skip) then
      continue;
    end if;
    if char_length(v_w) > char_length(v_longest) then
      v_longest := v_w;
    end if;
  end loop;

  if v_longest = '' then
    v_longest := coalesce(v_words[1], 'okul');
  end if;

  v_clean := regexp_replace(public.transliterate_tr_to_ascii(v_longest), '[^A-Z]', '', 'g');

  if char_length(v_clean) < 3 then
    v_clean := regexp_replace(
      public.transliterate_tr_to_ascii(coalesce(p_name, '')),
      '[^A-Z]',
      '',
      'g'
    );
  end if;

  if v_clean = '' then
    v_clean := 'OKUL';
  end if;

  return left(v_clean, 6);
end;
$$;

create or replace function public.generate_unique_school_code(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_code text;
  v_n int := 1;
begin
  v_base := public.school_name_to_code_base(p_name);

  loop
    v_code := v_base || v_n::text;
    exit when not exists (
      select 1
      from public.schools
      where school_code = v_code
    );
    v_n := v_n + 1;

    if v_n > 9999 then
      v_code := v_base || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      exit;
    end if;
  end loop;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Auto-generate code on insert
-- ---------------------------------------------------------------------------

create or replace function public.schools_set_school_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.school_code is null or btrim(new.school_code) = '' then
    new.school_code := public.generate_unique_school_code(new.name);
  else
    new.school_code := upper(btrim(new.school_code));
  end if;

  return new;
end;
$$;

drop trigger if exists schools_set_school_code_trigger on public.schools;

create trigger schools_set_school_code_trigger
  before insert on public.schools
  for each row
  execute function public.schools_set_school_code();

-- ---------------------------------------------------------------------------
-- 4. Backfill existing schools
-- ---------------------------------------------------------------------------

do $$
declare
  v_school record;
begin
  for v_school in
    select id, name
    from public.schools
    where school_code is null
    order by created_at asc
  loop
    update public.schools
    set school_code = public.generate_unique_school_code(v_school.name)
    where id = v_school.id;
  end loop;
end $$;

alter table public.schools
  alter column school_code set not null;

-- ---------------------------------------------------------------------------
-- 5. Public lookup for signup (anon + authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_school_id_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.schools
  where school_code = upper(btrim(coalesce(p_code, '')))
  limit 1;
$$;

revoke all on function public.resolve_school_id_by_code(text) from public;
grant execute on function public.resolve_school_id_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Honor invite school on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  begin
    v_school_id := nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid;
  exception
    when invalid_text_representation then
      v_school_id := null;
  end;

  insert into public.profiles (id, email, full_name, school_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(v_school_id, public.default_school_id())
  );

  return new;
end;
$$;
