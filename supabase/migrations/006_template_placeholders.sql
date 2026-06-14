-- Example templates using {{child_name}} placeholder

update public.message_templates
set
  title = 'Lunch',
  body = '{{child_name}} enjoyed a healthy lunch today.'
where title = 'Pickup reminder';

update public.message_templates
set
  title = 'Nap Time',
  body = '{{child_name}} had a restful nap this afternoon.'
where title = 'Field trip tomorrow';

update public.message_templates
set
  title = 'Pickup',
  body = 'Reminder: please pick up {{child_name}} by 5:30 PM today.'
where title = 'Illness notice';

insert into public.message_templates (title, body)
select 'Lunch', '{{child_name}} enjoyed a healthy lunch today.'
where not exists (select 1 from public.message_templates where title = 'Lunch');

insert into public.message_templates (title, body)
select 'Nap Time', '{{child_name}} had a restful nap this afternoon.'
where not exists (select 1 from public.message_templates where title = 'Nap Time');

insert into public.message_templates (title, body)
select 'Pickup', 'Reminder: please pick up {{child_name}} by 5:30 PM today.'
where not exists (select 1 from public.message_templates where title = 'Pickup');
