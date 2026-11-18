-- Apply after local-roles-resorts.sql. Existing applications with services keep
-- their original review flow; new owners submit their own first listing.
create or replace function public.review_resort_manager_application(application_id text, approved boolean, note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare a public.resort_manager_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only a Municipal Super Admin can review resort owner accounts.' using errcode = '42501';
  end if;
  select * into a from public.resort_manager_applications where id = application_id for update;
  if not found or a.status <> 'Pending' then
    raise exception 'Resort owner application is not pending.' using errcode = 'P0002';
  end if;
  if approved then
    insert into public.resort_managers (auth_user_id, name, contact, terms_accepted_at)
      values (a.auth_user_id, a.name, a.contact, a.terms_accepted_at);
    if jsonb_array_length(a.resort -> 'services') > 0 then
      insert into public.resort_submissions (
        owner_id, barangay_id, name, description, address, contact, images, services, status
      ) values (
        a.auth_user_id, a.resort ->> 'barangayId', a.resort ->> 'name',
        a.resort ->> 'description', a.resort ->> 'address', a.resort ->> 'contact',
        coalesce(a.resort -> 'images', '[]'::jsonb), a.resort -> 'services', 'Pending'
      );
    end if;
  end if;
  update public.resort_manager_applications
    set status = case when approved then 'Approved' else 'Rejected' end,
        review_note = left(coalesce(note, ''), 500),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = a.id;
  return case when approved then 'Approved' else 'Rejected' end;
end;
$$;

drop policy if exists "managers submit listings" on public.resort_submissions;
create policy "managers submit listings" on public.resort_submissions for insert to authenticated
  with check (
    owner_id = auth.uid() and status = 'Pending' and public.is_resort_manager()
    and (resort_id is null or public.owns_resort(resort_id))
    and public.valid_resort_services(services)
    and jsonb_array_length(services) > 0
  );

drop policy if exists "managers amend pending submissions" on public.resort_submissions;
create policy "managers amend pending submissions" on public.resort_submissions for update to authenticated
  using (owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id)))
  with check (
    owner_id = auth.uid() and status = 'Pending' and (resort_id is null or public.owns_resort(resort_id))
    and public.valid_resort_services(services)
    and jsonb_array_length(services) > 0
  );
