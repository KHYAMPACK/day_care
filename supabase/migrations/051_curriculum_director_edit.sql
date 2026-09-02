-- Directors can manage the global curriculum unit catalog (titles, week spans, order).

drop policy if exists "Directors can manage curriculum units" on public.curriculum_units;
create policy "Directors can manage curriculum units"
  on public.curriculum_units
  for all
  to authenticated
  using (public.is_director())
  with check (public.is_director());

grant insert, update, delete on public.curriculum_units to authenticated;
