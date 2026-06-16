-- Optional icon emoji for message templates (used in Şablon Sihirbazı)

alter table public.message_templates
  add column if not exists icon text not null default '💌';

update public.message_templates
set icon = '💌'
where icon is null or icon = '';
