-- Enable institutional accounting module for all existing schools.
-- Directors can disable it from Genel Bakış in the müdür panel.

update public.schools
set features = coalesce(features, '{}'::jsonb) || '{"accounting": true}'::jsonb
where coalesce((features ->> 'accounting')::boolean, false) = false;
