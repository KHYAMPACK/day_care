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
    insert into public.students (full_name, date_of_birth, school_id)
    values
      ('Elif Arslan', '2022-03-14', v_school_id),
      ('Mira Yıldız', '2021-07-22', v_school_id),
      ('Defne Koç', '2023-01-08', v_school_id),
      ('Eylül Öztürk', '2022-11-30', v_school_id),
      ('Zeynep Aydın', '2021-05-19', v_school_id),
      ('Ada Şahin', '2023-04-02', v_school_id),
      ('Lina Acar', '2022-09-17', v_school_id),
      ('Nehir Polat', '2021-12-03', v_school_id),
      ('Asya Güneş', '2023-06-25', v_school_id),
      ('Melis Erdoğan', '2022-02-11', v_school_id),
      ('Derin Korkmaz', '2021-08-28', v_school_id),
      ('Ece Taş', '2023-03-09', v_school_id),
      ('İpek Çetin', '2022-06-01', v_school_id),
      ('Selin Aksoy', '2021-10-15', v_school_id),
      ('Yağmur Yavuz', '2023-08-20', v_school_id),
      ('Azra Demirci', '2022-04-27', v_school_id),
      ('Beren Kaplan', '2021-02-06', v_school_id),
      ('Cemre Uçar', '2023-05-13', v_school_id),
      ('Duru Eren', '2022-12-21', v_school_id),
      ('Esila Tunç', '2021-09-04', v_school_id),
      ('Arda Kılıç', '2022-01-18', v_school_id),
      ('Emir Bozkurt', '2021-04-11', v_school_id),
      ('Kerem Yalçın', '2023-02-26', v_school_id),
      ('Mert Can', '2022-08-07', v_school_id),
      ('Alp Şimşek', '2021-11-23', v_school_id),
      ('Baran Tekin', '2023-07-16', v_school_id),
      ('Deniz Karaca', '2022-05-29', v_school_id),
      ('Efe Aktaş', '2021-06-12', v_school_id),
      ('Kaan Özkan', '2023-09-05', v_school_id),
      ('Yiğit Sezer', '2022-10-10', v_school_id),
      ('Umut Işık', '2021-03-31', v_school_id),
      ('Berkay Gül', '2023-11-18', v_school_id),
      ('Caner Aslan', '2022-07-03', v_school_id),
      ('Doruk Bayrak', '2021-01-27', v_school_id),
      ('Emre Çakır', '2023-04-22', v_school_id),
      ('Furkan Durmuş', '2022-03-05', v_school_id),
      ('Gökhan Sarı', '2021-08-09', v_school_id),
      ('Hakan Uysal', '2023-06-14', v_school_id),
      ('Kuzey Ateş', '2022-11-02', v_school_id),
      ('Ozan Yılmaz', '2021-12-19', v_school_id)
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
