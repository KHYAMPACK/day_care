-- Demo dataset for sales presentations: Yıldızlar Demo Kreşi
-- Run once in Supabase SQL Editor (requires postgres / service role).
-- Demo teacher password for all accounts: Demo1234!
--
-- Alternatively: add SUPABASE_SERVICE_ROLE_KEY to .env and run `npm run seed-demo`

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper: create auth user + identity if missing (enables login)
-- ---------------------------------------------------------------------------

create or replace function public.seed_demo_auth_user(
  p_id uuid,
  p_email text,
  p_full_name text,
  p_password text default 'Demo1234!'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not exists (select 1 from auth.users where id = p_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      p_id,
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name),
      now(),
      now(),
      false,
      false
    );
  end if;

  if not exists (
    select 1
    from auth.identities
    where user_id = p_id
      and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      p_id,
      p_id::text,
      jsonb_build_object('sub', p_id::text, 'email', p_email),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  insert into public.profiles (id, email, full_name, role, school_id)
  values (p_id, p_email, p_full_name, 'teacher', public.default_school_id())
  on conflict (id) do nothing;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed demo school, staff, students, assignments, templates
-- ---------------------------------------------------------------------------

do $$
declare
  v_school_id uuid;
  v_teacher_ids uuid[] := array[
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'a1000000-0000-4000-8000-000000000002'::uuid,
    'a1000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000004'::uuid
  ];
  v_teacher_names text[] := array[
    'Ayşe Yılmaz',
    'Fatma Demir',
    'Zeynep Kaya',
    'Murat Çelik'
  ];
  v_teacher_emails text[] := array[
    'ayse@demo.com',
    'fatma@demo.com',
    'zeynep@demo.com',
    'murat@demo.com'
  ];
  v_i int;
begin
  select id
  into v_school_id
  from public.schools
  where school_code = 'DEMO123';

  if v_school_id is null then
    insert into public.schools (name, school_code)
    values ('Yıldızlar Demo Kreşi', 'DEMO123')
    returning id into v_school_id;
  else
    update public.schools
    set name = 'Yıldızlar Demo Kreşi'
    where id = v_school_id;
  end if;

  for v_i in 1..4 loop
    perform public.seed_demo_auth_user(
      v_teacher_ids[v_i],
      v_teacher_emails[v_i],
      v_teacher_names[v_i]
    );

    update public.profiles
    set
      full_name = v_teacher_names[v_i],
      email = v_teacher_emails[v_i],
      role = 'teacher',
      school_id = v_school_id
    where id = v_teacher_ids[v_i];
  end loop;

  delete from public.teacher_students ts
  using public.students s
  where ts.student_id = s.id
    and s.school_id = v_school_id;

  delete from public.students
  where school_id = v_school_id;

  delete from public.message_templates
  where school_id = v_school_id;

  with inserted as (
    insert into public.students (full_name, school_id)
    values
      ('Elif Arslan', v_school_id),
      ('Mira Yıldız', v_school_id),
      ('Defne Koç', v_school_id),
      ('Eylül Öztürk', v_school_id),
      ('Zeynep Aydın', v_school_id),
      ('Ada Şahin', v_school_id),
      ('Lina Acar', v_school_id),
      ('Nehir Polat', v_school_id),
      ('Asya Güneş', v_school_id),
      ('Melis Erdoğan', v_school_id),
      ('Derin Korkmaz', v_school_id),
      ('Ece Taş', v_school_id),
      ('İpek Çetin', v_school_id),
      ('Selin Aksoy', v_school_id),
      ('Yağmur Yavuz', v_school_id),
      ('Azra Demirci', v_school_id),
      ('Beren Kaplan', v_school_id),
      ('Cemre Uçar', v_school_id),
      ('Duru Eren', v_school_id),
      ('Esila Tunç', v_school_id),
      ('Arda Kılıç', v_school_id),
      ('Emir Bozkurt', v_school_id),
      ('Kerem Yalçın', v_school_id),
      ('Mert Can', v_school_id),
      ('Alp Şimşek', v_school_id),
      ('Baran Tekin', v_school_id),
      ('Deniz Karaca', v_school_id),
      ('Efe Aktaş', v_school_id),
      ('Kaan Özkan', v_school_id),
      ('Yiğit Sezer', v_school_id),
      ('Umut Işık', v_school_id),
      ('Berkay Gül', v_school_id),
      ('Caner Aslan', v_school_id),
      ('Doruk Bayrak', v_school_id),
      ('Emre Çakır', v_school_id),
      ('Furkan Durmuş', v_school_id),
      ('Gökhan Sarı', v_school_id),
      ('Hakan Uysal', v_school_id),
      ('Kuzey Ateş', v_school_id),
      ('Ozan Yılmaz', v_school_id)
    returning id, full_name
  ),
  numbered as (
    select
      id,
      row_number() over (order by full_name) as rn
    from inserted
  )
  insert into public.teacher_students (teacher_id, student_id)
  select
    v_teacher_ids[((numbered.rn - 1) / 10) + 1],
    numbered.id
  from numbered;

  insert into public.message_templates (title, body, icon, school_id)
  values
    (
      'Yemek',
      '🍽️ Bugün yemeğini çok güzel yedi, tabağını bitirdi!',
      '🍽️',
      v_school_id
    ),
    (
      'Uyku',
      '😴 Öğle uykusunu mışıl mışıl uyudu, enerjisini topladı.',
      '😴',
      v_school_id
    ),
    (
      'Etkinlik',
      '🎨 Bugün parmak boyaması yaptık ve çok eğlendik!',
      '🎨',
      v_school_id
    ),
    (
      'İlaç',
      '💊 İlacı öğretmen gözetiminde saatinde içildi.',
      '💊',
      v_school_id
    ),
    (
      'Genel Duyuru',
      '📢 Yarınki pijama partisi için lütfen yedek kıyafet getirmeyi unutmayın!',
      '📢',
      v_school_id
    );
end $$;

-- Optional cleanup of helper (keep if you may re-run seed manually)
-- drop function if exists public.seed_demo_auth_user(uuid, text, text, text);
