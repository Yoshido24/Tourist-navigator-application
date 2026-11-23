-- Monthly booking exports. Run after the role/RLS migrations.
create or replace function public.export_bookings_for_month(p_month date)
returns table (
  booking_id text,
  booking_status text,
  booking_date text,
  booking_time text,
  destination text,
  target_type text,
  traveler_name text,
  contact text,
  adults integer,
  children integer,
  pwd integer,
  assigned_guide text,
  check_in text,
  check_out text,
  service_fee bigint,
  notes text,
  created_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  booking public.bookings%rowtype;
  month_start date := date_trunc('month', p_month)::date;
  effective_date date;
begin
  if p_month is null then
    raise exception 'An export month is required.' using errcode = '22004';
  end if;

  for booking in
    select *
    from public.bookings
  loop
    effective_date := (booking.created_at at time zone 'Asia/Manila')::date;
    if booking.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin
        effective_date := booking.date::date;
      exception
        when invalid_datetime_format or datetime_field_overflow then
          effective_date := (booking.created_at at time zone 'Asia/Manila')::date;
      end;
    end if;
    if effective_date < month_start or effective_date >= (month_start + interval '1 month')::date then
      continue;
    end if;

    booking_id := booking.id;
    booking_status := booking.status;
    booking_date := booking.date;
    booking_time := booking.time;
    destination := coalesce(nullif(booking."attractionName", ''), booking.service_name);
    target_type := booking.target_type;
    traveler_name := booking."travelerName";
    contact := booking.contact;
    adults := coalesce(booking.adults, 0);
    children := coalesce(booking.kids, 0);
    pwd := coalesce(booking.pwd, 0);
    assigned_guide := booking."assignedGuide";
    check_in := booking."checkIn";
    check_out := booking."checkOut";
    service_fee := booking.service_fee;
    notes := booking.notes;
    created_at := booking.created_at;
    approved_at := booking."approvedAt";
    completed_at := booking."completedAt";
    return next;
  end loop;
end;
$$;

revoke all on function public.export_bookings_for_month(date) from public;
grant execute on function public.export_bookings_for_month(date) to authenticated;

notify pgrst, 'reload schema';
