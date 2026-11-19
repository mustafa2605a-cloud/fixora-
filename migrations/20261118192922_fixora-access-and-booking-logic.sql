CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    JOIN public.app_config AS c
      ON c.admin_email IS NOT NULL
     AND lower(u.email) = lower(c.admin_email)
    WHERE u.id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_profile(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text;
  v_is_admin boolean;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = v_uid;
  v_is_admin := public.is_admin();

  INSERT INTO public.profiles AS p (id, full_name, email, phone, role)
  VALUES (
    v_uid,
    nullif(btrim(coalesce(p_full_name, '')), ''),
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'customer' END
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), p.full_name),
        phone = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), p.phone),
        email = coalesce(p.email, v_email),
        role = CASE WHEN v_is_admin THEN 'admin' ELSE 'customer' END
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_availability(p_date date)
RETURNS TABLE (start_time time, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.business_settings;
BEGIN
  SELECT * INTO v_settings FROM public.business_settings WHERE id = true;

  RETURN QUERY
  WITH generated AS (
    SELECT g::time AS slot_start
    FROM generate_series(
      p_date::timestamp + v_settings.business_hours_start,
      p_date::timestamp + v_settings.business_hours_end - interval '2 hours',
      interval '2 hours'
    ) AS g
  )
  SELECT
    g.slot_start,
    greatest(
      coalesce(s.capacity, v_settings.slot_capacity)
        - coalesce(t.taken, 0),
      0
    )::integer
  FROM generated AS g
  LEFT JOIN public.booking_slots AS s
    ON s.appointment_date = p_date
   AND s.appointment_start_time = g.slot_start
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS taken
    FROM public.bookings AS b
    WHERE b.appointment_date = p_date
      AND b.appointment_start_time = g.slot_start
      AND b.booking_status NOT IN ('cancelled', 'rejected', 'payment_failed')
  ) AS t ON true
  WHERE (extract(isodow FROM p_date))::smallint = ANY (v_settings.working_days)
    AND coalesce(s.is_blocked, false) = false
  ORDER BY g.slot_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_availability(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_availability(date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_service_id uuid,
  p_task_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_problem_description text,
  p_service_address text,
  p_city text,
  p_area text,
  p_street text DEFAULT NULL,
  p_building_number text DEFAULT NULL,
  p_apartment_number text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_additional_directions text DEFAULT NULL,
  p_appointment_date date DEFAULT NULL,
  p_appointment_start_time time DEFAULT NULL,
  p_customer_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  booking_reference text,
  booking_status text,
  payment_status text,
  total_amount numeric,
  currency text,
  appointment_date date,
  appointment_start_time time,
  lookup_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.business_settings;
  v_service public.services;
  v_task public.service_tasks;
  v_slot public.booking_slots;
  v_taken integer;
  v_uid uuid := (SELECT auth.uid());
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_address text := nullif(btrim(coalesce(p_service_address, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
  v_service_price numeric(10, 2);
  v_task_price numeric(10, 2) := 0;
  v_fee numeric(10, 2);
  v_total numeric(10, 2);
  v_start time;
  v_end time;
  v_token text;
  v_booking public.bookings;
  v_existing public.bookings;
BEGIN
  SELECT * INTO v_settings FROM public.business_settings WHERE id = true;

  -- Validation ------------------------------------------------------------
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL OR char_length(regexp_replace(v_phone, '\D', '', 'g')) < 6 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NULL OR char_length(v_address) < 5 THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF v_city IS NULL OR v_area IS NULL THEN
    RAISE EXCEPTION 'invalid_city_or_area' USING ERRCODE = '22023';
  END IF;
  IF p_appointment_date IS NULL OR p_appointment_start_time IS NULL THEN
    RAISE EXCEPTION 'invalid_appointment' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_service
  FROM public.services AS s
  WHERE s.id = p_service_id AND s.active_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_service' USING ERRCODE = '22023';
  END IF;

  IF p_task_id IS NOT NULL THEN
    SELECT * INTO v_task
    FROM public.service_tasks AS t
    WHERE t.id = p_task_id AND t.service_id = p_service_id AND t.active_status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_task' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_appointment_date < current_date THEN
    RAISE EXCEPTION 'appointment_in_past' USING ERRCODE = '22023';
  END IF;
  IF p_appointment_date > current_date + v_settings.max_advance_days THEN
    RAISE EXCEPTION 'appointment_too_far' USING ERRCODE = '22023';
  END IF;
  IF NOT ((extract(isodow FROM p_appointment_date))::smallint = ANY (v_settings.working_days)) THEN
    RAISE EXCEPTION 'business_closed_that_day' USING ERRCODE = '22023';
  END IF;
  IF p_appointment_start_time < v_settings.business_hours_start
     OR p_appointment_start_time >= v_settings.business_hours_end THEN
    RAISE EXCEPTION 'outside_business_hours' USING ERRCODE = '22023';
  END IF;
  IF (p_appointment_date + p_appointment_start_time) < now() + make_interval(hours => v_settings.min_lead_hours) THEN
    RAISE EXCEPTION 'slot_too_soon' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_areas AS a
    WHERE a.active_status
      AND lower(a.city) = lower(v_city)
      AND lower(a.area_name) = lower(v_area)
  ) THEN
    RAISE EXCEPTION 'area_not_served' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: a repeated submit returns the original booking ------------
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.bookings AS b WHERE b.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RAISE EXCEPTION 'duplicate_submission' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Server-side pricing ----------------------------------------------------
  v_service_price := v_service.starting_price;
  IF p_task_id IS NOT NULL THEN
    v_task_price := coalesce(v_task.additional_price, 0);
  END IF;
  v_fee := coalesce(v_service.booking_fee, v_settings.default_booking_fee);
  v_total := v_service_price + v_task_price + v_fee;
  v_start := p_appointment_start_time;
  v_end := v_start + make_interval(mins => coalesce(v_task.duration_minutes, v_service.duration_minutes, v_settings.default_service_duration_minutes));

  -- Slot reservation: row lock serialises concurrent checkouts ------------
  INSERT INTO public.booking_slots AS bs (appointment_date, appointment_start_time, capacity)
  VALUES (p_appointment_date, p_appointment_start_time, v_settings.slot_capacity)
  ON CONFLICT ON CONSTRAINT booking_slots_unique DO NOTHING;

  SELECT * INTO v_slot
  FROM public.booking_slots AS bs
  WHERE bs.appointment_date = p_appointment_date
    AND bs.appointment_start_time = p_appointment_start_time
  FOR UPDATE;

  IF v_slot.is_blocked THEN
    RAISE EXCEPTION 'slot_blocked' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_taken
  FROM public.bookings AS b
  WHERE b.appointment_date = p_appointment_date
    AND b.appointment_start_time = p_appointment_start_time
    AND b.booking_status NOT IN ('cancelled', 'rejected', 'payment_failed');

  IF v_taken >= v_slot.capacity THEN
    RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '22023';
  END IF;

  -- Creation ---------------------------------------------------------------
  -- 48 hex chars from a UUID plus high-resolution clock, no pgcrypto needed.
  v_token := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');

  INSERT INTO public.bookings AS b (
    booking_reference, idempotency_key, lookup_token_hash, customer_user_id,
    guest_name, guest_email, guest_phone,
    service_id, service_name_snapshot, task_id, task_name_snapshot, problem_description,
    service_address, city, area, street, building_number, apartment_number, postal_code,
    additional_directions, appointment_date, appointment_start_time, appointment_end_time,
    booking_status, payment_status,
    service_price_snapshot, additional_task_price_snapshot, booking_fee_snapshot, discount_amount,
    total_amount, currency, customer_notes
  )
  VALUES (
    'FX-' || nextval('public.booking_reference_seq'),
    p_idempotency_key,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_uid,
    v_name, v_email, v_phone,
    v_service.id, v_service.name, v_task.id, v_task.name, nullif(btrim(coalesce(p_problem_description, '')), ''),
    v_address, v_city, v_area, p_street, p_building_number, p_apartment_number, p_postal_code,
    p_additional_directions, p_appointment_date, v_start, v_end,
    'pending_payment', 'unpaid',
    v_service_price, v_task_price, v_fee, 0,
    v_total, v_settings.currency, nullif(btrim(coalesce(p_customer_notes, '')), '')
  )
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, NULL, 'pending_payment', 'booking_created', v_uid, 'Guest checkout submitted');

  RETURN QUERY SELECT
    v_booking.id, v_booking.booking_reference, v_booking.booking_status, v_booking.payment_status,
    v_booking.total_amount, v_booking.currency, v_booking.appointment_date,
    v_booking.appointment_start_time, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, date, time, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, date, time, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lookup_booking(p_reference text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_history jsonb;
BEGIN
  IF p_reference IS NULL OR p_token IS NULL OR char_length(coalesce(p_token, '')) < 16 THEN
    RAISE EXCEPTION 'invalid_lookup' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings AS b
  WHERE b.booking_reference = upper(btrim(p_reference))
    AND b.lookup_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'status', h.new_status, 'action', h.action, 'at', h.created_at
         ) ORDER BY h.created_at), '[]'::jsonb)
  INTO v_history
  FROM public.booking_status_history AS h
  WHERE h.booking_id = v_booking.id;

  RETURN jsonb_build_object(
    'booking_reference', v_booking.booking_reference,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'service_name', v_booking.service_name_snapshot,
    'task_name', v_booking.task_name_snapshot,
    'appointment_date', v_booking.appointment_date,
    'appointment_start_time', v_booking.appointment_start_time,
    'appointment_end_time', v_booking.appointment_end_time,
    'total_amount', v_booking.total_amount,
    'currency', v_booking.currency,
    'contact_name', v_booking.guest_name,
    'contact_email', v_booking.guest_email,
    'contact_phone', v_booking.guest_phone,
    'service_address', v_booking.service_address,
    'city', v_booking.city,
    'area', v_booking.area,
    'technician', (
      SELECT t.full_name FROM public.technicians AS t WHERE t.id = v_booking.assigned_technician_id
    ),
    'created_at', v_booking.created_at,
    'history', v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_booking(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lookup_booking(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_reference text, p_token text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings AS b
  WHERE b.booking_reference = upper(btrim(p_reference))
    AND b.lookup_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.booking_status IN ('completed', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = '22023';
  END IF;
  IF (v_booking.appointment_date + v_booking.appointment_start_time) < now() THEN
    RAISE EXCEPTION 'appointment_already_passed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings AS b
  SET booking_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Cancelled by customer')
  WHERE b.id = v_booking.id;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_booking.booking_status, 'cancelled', 'customer_cancelled', (SELECT auth.uid()), p_reason);

  RETURN jsonb_build_object('booking_reference', v_booking.booking_reference, 'booking_status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_booking(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_booking_status(p_booking_id uuid, p_new_status text, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_new_status NOT IN ('pending_payment', 'confirmed', 'technician_assigned', 'in_progress',
                          'completed', 'cancelled', 'rejected', 'payment_failed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.bookings AS b
  SET booking_status = p_new_status,
      completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE b.completed_at END,
      cancelled_at = CASE WHEN p_new_status IN ('cancelled', 'rejected') THEN now() ELSE b.cancelled_at END,
      cancellation_reason = CASE
        WHEN p_new_status IN ('cancelled', 'rejected') THEN coalesce(nullif(btrim(coalesce(p_notes, '')), ''), b.cancellation_reason)
        ELSE b.cancellation_reason
      END
  WHERE b.id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (p_booking_id, v_booking.booking_status, p_new_status, 'status_changed', v_actor, p_notes);

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.set_booking_status(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_booking_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_technician(p_booking_id uuid, p_technician_id uuid, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_technician public.technicians;
  v_previous uuid;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_technician FROM public.technicians AS t WHERE t.id = p_technician_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'technician_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_technician.active_status THEN
    RAISE EXCEPTION 'technician_inactive' USING ERRCODE = '22023';
  END IF;
  IF v_technician.availability_status IN ('off_duty', 'unavailable') THEN
    RAISE EXCEPTION 'technician_unavailable' USING ERRCODE = '22023';
  END IF;

  -- Do not double-book a technician into the same date + start time.
  IF EXISTS (
    SELECT 1 FROM public.bookings AS b
    WHERE b.assigned_technician_id = p_technician_id
      AND b.appointment_date = v_booking.appointment_date
      AND b.appointment_start_time = v_booking.appointment_start_time
      AND b.id <> v_booking.id
      AND b.booking_status NOT IN ('cancelled', 'rejected', 'payment_failed')
  ) THEN
    RAISE EXCEPTION 'technician_already_booked_that_slot' USING ERRCODE = '23505';
  END IF;

  v_previous := v_booking.assigned_technician_id;

  IF v_previous IS NOT NULL AND v_previous <> p_technician_id THEN
    UPDATE public.technician_assignments AS a
    SET assignment_status = 'reassigned'
    WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';
  END IF;

  INSERT INTO public.technician_assignments (booking_id, technician_id, assigned_by, assignment_status, notes)
  VALUES (v_booking.id, p_technician_id, v_actor, 'assigned', p_notes);

  UPDATE public.bookings AS b
  SET assigned_technician_id = p_technician_id,
      booking_status = CASE
        WHEN b.booking_status IN ('pending_payment', 'payment_failed') THEN b.booking_status
        ELSE 'technician_assigned'
      END
  WHERE b.id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (
    v_booking.id,
    CASE WHEN v_previous IS NULL THEN NULL ELSE v_booking.booking_status END,
    v_booking.booking_status,
    CASE WHEN v_previous IS NULL THEN 'technician_assigned' ELSE 'technician_reassigned' END,
    v_actor,
    p_notes
  );

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_technician(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assign_technician(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_payment_paid(
  p_booking_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_currency text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_payment public.payments;
BEGIN
  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_provider NOT IN ('stripe', 'razorpay', 'manual') THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < v_booking.total_amount THEN
    RAISE EXCEPTION 'payment_amount_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_provider_transaction_id IS NULL THEN
    RAISE EXCEPTION 'missing_transaction_id' USING ERRCODE = '22023';
  END IF;

  IF v_booking.payment_status = 'paid' THEN
    RETURN v_booking; -- idempotent: duplicate webhook
  END IF;

  INSERT INTO public.payments AS p (
    booking_id, customer_user_id, provider, provider_transaction_id, amount, currency,
    payment_method, payment_status, paid_at
  )
  VALUES (
    v_booking.id, v_booking.customer_user_id, p_provider, p_provider_transaction_id,
    p_amount, coalesce(p_currency, v_booking.currency), p_payment_method, 'succeeded', now()
  )
  ON CONFLICT (provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL
  DO UPDATE SET payment_status = 'succeeded', paid_at = now()
  RETURNING * INTO v_payment;

  UPDATE public.bookings AS b
  SET payment_status = 'paid',
      booking_status = CASE
        WHEN b.booking_status IN ('pending_payment', 'payment_failed') THEN 'confirmed'
        ELSE b.booking_status
      END
  WHERE b.id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
  VALUES (v_booking.id, 'pending_payment', v_booking.booking_status, 'payment_verified',
          'Verified ' || p_provider || ' transaction ' || p_provider_transaction_id);

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payment_paid(uuid, text, text, numeric, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.attach_booking_file(
  p_reference text,
  p_token text,
  p_storage_path text,
  p_original_file_name text,
  p_file_type text,
  p_file_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking_id uuid;
  v_id uuid;
BEGIN
  SELECT b.id INTO v_booking_id
  FROM public.bookings AS b
  WHERE b.booking_reference = upper(btrim(p_reference))
    AND b.lookup_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_file_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'unsupported_file_type' USING ERRCODE = '22023';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 5242880 THEN
    RAISE EXCEPTION 'invalid_file_size' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.booking_attachments (booking_id, storage_path, original_file_name, file_type, file_size)
  VALUES (v_booking_id, p_storage_path, p_original_file_name, p_file_type, p_file_size)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_booking_file(text, text, text, text, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.attach_booking_file(text, text, text, text, text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_bookings', (SELECT count(*) FROM public.bookings),
    'bookings_in_period', (SELECT count(*) FROM public.bookings WHERE created_at >= v_since),
    'pending_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('pending_payment', 'payment_failed')),
    'confirmed_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('confirmed', 'technician_assigned')),
    'active_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('confirmed', 'technician_assigned', 'in_progress')),
    'completed_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status = 'completed'),
    'cancelled_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('cancelled', 'rejected')),
    'revenue_in_period', (
      SELECT coalesce(sum(p.amount - p.refunded_amount), 0)
      FROM public.payments AS p
      WHERE p.payment_status IN ('succeeded', 'partially_refunded', 'refunded')
        AND p.created_at >= v_since
    ),
    'revenue_total', (
      SELECT coalesce(sum(p.amount - p.refunded_amount), 0)
      FROM public.payments AS p
      WHERE p.payment_status IN ('succeeded', 'partially_refunded', 'refunded')
    ),
    'total_customers', (SELECT count(*) FROM public.profiles WHERE role = 'customer'),
    'guest_bookings', (SELECT count(*) FROM public.bookings WHERE customer_user_id IS NULL),
    'available_technicians', (SELECT count(*) FROM public.technicians WHERE active_status AND availability_status = 'available'),
    'total_technicians', (SELECT count(*) FROM public.technicians WHERE active_status),
    'average_rating', (
      SELECT coalesce(round(avg(r.rating)::numeric, 2), 0)
      FROM public.reviews AS r WHERE r.visibility_status = 'published'
    ),
    'popular_services', (
      SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.bookings DESC), '[]'::jsonb)
      FROM (
        SELECT s.name, count(b.id) AS bookings
        FROM public.services AS s
        LEFT JOIN public.bookings AS b ON b.service_id = s.id AND b.created_at >= v_since
        GROUP BY s.name
      ) AS x
    ),
    'monthly_revenue', (
      SELECT coalesce(jsonb_agg(row_to_json(y) ORDER BY y.month), '[]'::jsonb)
      FROM (
        SELECT to_char(date_trunc('month', p.created_at), 'Mon') AS month,
               date_trunc('month', p.created_at) AS month_start,
               sum(p.amount - p.refunded_amount) AS value
        FROM public.payments AS p
        WHERE p.payment_status IN ('succeeded', 'partially_refunded', 'refunded')
          AND p.created_at >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1, 2
      ) AS y
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(integer) TO authenticated;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.technician_skills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.technician_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_config FROM anon, authenticated;

GRANT SELECT ON public.business_settings TO anon, authenticated;

GRANT UPDATE ON public.business_settings TO authenticated;

CREATE POLICY business_settings_public_read ON public.business_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY business_settings_admin_write ON public.business_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;

GRANT UPDATE (full_name, phone, profile_image) ON public.profiles TO authenticated;

CREATE POLICY profiles_read_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY profiles_update_own_or_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role_is_server_managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'account_status_is_server_managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'email_is_server_managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_fields();

GRANT SELECT ON public.services TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;

CREATE POLICY services_public_read ON public.services
  FOR SELECT TO anon, authenticated USING (active_status OR public.is_admin());

CREATE POLICY services_admin_write ON public.services
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.service_tasks TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.service_tasks TO authenticated;

CREATE POLICY service_tasks_public_read ON public.service_tasks
  FOR SELECT TO anon, authenticated USING (active_status OR public.is_admin());

CREATE POLICY service_tasks_admin_write ON public.service_tasks
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.service_areas TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.service_areas TO authenticated;

CREATE POLICY service_areas_public_read ON public.service_areas
  FOR SELECT TO anon, authenticated USING (active_status OR public.is_admin());

CREATE POLICY service_areas_admin_write ON public.service_areas
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.technicians TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.technicians TO authenticated;

CREATE POLICY technicians_public_read ON public.technicians
  FOR SELECT TO anon, authenticated USING (active_status OR public.is_admin());

CREATE POLICY technicians_admin_write ON public.technicians
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.technician_skills TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.technician_skills TO authenticated;

CREATE POLICY technician_skills_public_read ON public.technician_skills
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY technician_skills_admin_write ON public.technician_skills
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.technician_assignments FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.technician_assignments TO authenticated;

CREATE POLICY technician_assignments_admin ON public.technician_assignments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.booking_slots FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_slots TO authenticated;

CREATE POLICY booking_slots_admin ON public.booking_slots
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.bookings FROM anon, authenticated;

GRANT SELECT ON public.bookings TO authenticated;

GRANT UPDATE (admin_notes, assigned_technician_id, booking_status, payment_status,
              appointment_date, appointment_start_time, appointment_end_time,
              cancellation_reason, completed_at, cancelled_at, discount_amount, total_amount)
  ON public.bookings TO authenticated;

CREATE POLICY bookings_read_own_or_admin ON public.bookings
  FOR SELECT TO authenticated
  USING (customer_user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY bookings_admin_update ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.booking_status_history FROM anon, authenticated;

GRANT SELECT ON public.booking_status_history TO authenticated;

CREATE POLICY booking_status_history_read ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings AS b
      WHERE b.id = booking_status_history.booking_id
        AND b.customer_user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.history_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'booking history is append only';
END;
$$;

CREATE TRIGGER booking_status_history_append_only
  BEFORE UPDATE OR DELETE ON public.booking_status_history
  FOR EACH ROW EXECUTE FUNCTION public.history_is_append_only();

REVOKE ALL ON public.addresses FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;

CREATE POLICY addresses_owner ON public.addresses
  FOR ALL TO authenticated
  USING (customer_user_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (customer_user_id = (SELECT auth.uid()) OR public.is_admin());

REVOKE ALL ON public.payments FROM anon, authenticated;

GRANT SELECT ON public.payments TO authenticated;

CREATE POLICY payments_read_own_or_admin ON public.payments
  FOR SELECT TO authenticated
  USING (customer_user_id = (SELECT auth.uid()) OR public.is_admin());

REVOKE ALL ON public.reviews FROM anon, authenticated;

GRANT SELECT ON public.reviews TO anon, authenticated;

GRANT INSERT, UPDATE ON public.reviews TO authenticated;

CREATE POLICY reviews_public_read ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (visibility_status = 'published' OR customer_user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY reviews_customer_insert ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bookings AS b
      WHERE b.id = reviews.booking_id
        AND b.customer_user_id = (SELECT auth.uid())
        AND b.booking_status = 'completed'
    )
  );

CREATE POLICY reviews_admin_update ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR customer_user_id = (SELECT auth.uid()))
  WITH CHECK (public.is_admin() OR customer_user_id = (SELECT auth.uid()));

REVOKE ALL ON public.notifications FROM anon, authenticated;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

CREATE POLICY notifications_owner_read ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.booking_attachments FROM anon, authenticated;

GRANT SELECT ON public.booking_attachments TO authenticated;

CREATE POLICY booking_attachments_admin_read ON public.booking_attachments
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.email_logs FROM anon, authenticated;

GRANT SELECT ON public.email_logs TO authenticated;

CREATE POLICY email_logs_admin_read ON public.email_logs
  FOR SELECT TO authenticated USING (public.is_admin());

GRANT USAGE ON SCHEMA public TO anon, authenticated;
