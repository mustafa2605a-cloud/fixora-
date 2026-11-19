-- =============================================================================
-- Fixora v2 — catalogue fixes, booking lifecycle, Stripe fulfilment, email
-- outbox, admin operations, contact messages and tightened access control.
-- Builds on the four 2026-11-18 migrations already applied to this project.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalogue: marketing columns + pricing semantics fix
-- -----------------------------------------------------------------------------
-- Price of a task = services.starting_price + service_tasks.additional_price.
-- The seed stored the full task price in additional_price, which made the
-- backend total (starting + full task price + fee) disagree with the website.
UPDATE public.service_tasks AS t
SET additional_price = t.additional_price - s.starting_price
FROM public.services AS s
WHERE s.id = t.service_id
  AND t.additional_price >= s.starting_price;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'wrench',
  ADD COLUMN IF NOT EXISTS includes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_key text;

ALTER TABLE public.services
  ADD CONSTRAINT services_icon_check
  CHECK (icon IN ('wrench', 'zap', 'snowflake', 'sparkles', 'hammer', 'paintbrush'));

UPDATE public.services SET short_description = 'Leaks, clogs, taps and water heaters fixed fast.', icon = 'wrench',
  includes = ARRAY['Leak detection', 'Drain unclogging', 'Tap & mixer replacement', 'Water heater service'] WHERE slug = 'plumbing';
UPDATE public.services SET short_description = 'Safe wiring, outlets, lighting and fuse boxes.', icon = 'zap',
  includes = ARRAY['Outlet & switch install', 'Light fixtures', 'Fuse box diagnostics', 'Safety inspection'] WHERE slug = 'electrical';
UPDATE public.services SET short_description = 'Servicing, gas top-ups and installations.', icon = 'snowflake',
  includes = ARRAY['Filter & coil cleaning', 'Gas top-up', 'Noise & leak fixes', 'New unit install'] WHERE slug = 'ac-repair';
UPDATE public.services SET short_description = 'Deep cleans, move-in/out and regular visits.', icon = 'sparkles',
  includes = ARRAY['Kitchen & bathrooms', 'Dusting & vacuuming', 'Eco-friendly supplies', 'Move-in / move-out'] WHERE slug = 'cleaning';
UPDATE public.services SET short_description = 'Furniture assembly, doors, shelves and repairs.', icon = 'hammer',
  includes = ARRAY['Furniture assembly', 'Door & lock repair', 'Shelving & mounting', 'Woodwork repairs'] WHERE slug = 'carpentry';
UPDATE public.services SET short_description = 'Interior walls, touch-ups and full repaints.', icon = 'paintbrush',
  includes = ARRAY['Surface prep & patching', 'Premium low-VOC paint', 'Furniture protection', 'Post-job cleanup'] WHERE slug = 'painting';

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS specialization text,
  ADD COLUMN IF NOT EXISTS profile_image_key text;

-- Business timezone: appointment dates/times are local business time.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dubai',
  ADD COLUMN IF NOT EXISTS payment_hold_minutes integer NOT NULL DEFAULT 30 CHECK (payment_hold_minutes BETWEEN 10 AND 180);

-- -----------------------------------------------------------------------------
-- 2. Booking columns for payment holds and guest-link encryption
-- -----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lookup_token_cipher text;

CREATE INDEX IF NOT EXISTS bookings_pending_expiry_idx
  ON public.bookings (payment_expires_at) WHERE booking_status = 'pending_payment';

CREATE INDEX IF NOT EXISTS bookings_reference_lower_idx ON public.bookings (booking_reference);

-- -----------------------------------------------------------------------------
-- 3. Admin identity: verified email that matches app_config.admin_email
-- -----------------------------------------------------------------------------
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
      AND coalesce(u.email_verified, false)
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Slot helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_holds_slot(p_status text, p_expires timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_status NOT IN ('cancelled', 'rejected', 'payment_failed')
     AND NOT (p_status = 'pending_payment' AND p_expires IS NOT NULL AND p_expires < now());
$$;

CREATE OR REPLACE FUNCTION public.slot_taken(p_date date, p_time time, p_exclude uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*)::integer
  FROM public.bookings AS b
  WHERE b.appointment_date = p_date
    AND b.appointment_start_time = p_time
    AND (p_exclude IS NULL OR b.id <> p_exclude)
    AND public.booking_holds_slot(b.booking_status, b.payment_expires_at);
$$;

REVOKE ALL ON FUNCTION public.slot_taken(date, time, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.business_now()
RETURNS timestamp
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE coalesce((SELECT timezone FROM public.business_settings WHERE id), 'UTC'));
$$;

-- Validates a requested appointment against business rules. Raises on error.
CREATE OR REPLACE FUNCTION public.assert_bookable_time(p_date date, p_time time)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v public.business_settings;
  v_now timestamp := public.business_now();
BEGIN
  SELECT * INTO v FROM public.business_settings WHERE id = true;
  IF p_date IS NULL OR p_time IS NULL THEN
    RAISE EXCEPTION 'invalid_appointment' USING ERRCODE = '22023';
  END IF;
  IF p_date < v_now::date THEN
    RAISE EXCEPTION 'appointment_in_past' USING ERRCODE = '22023';
  END IF;
  IF p_date > v_now::date + v.max_advance_days THEN
    RAISE EXCEPTION 'appointment_too_far' USING ERRCODE = '22023';
  END IF;
  IF NOT ((extract(isodow FROM p_date))::smallint = ANY (v.working_days)) THEN
    RAISE EXCEPTION 'business_closed_that_day' USING ERRCODE = '22023';
  END IF;
  IF p_time < v.business_hours_start OR p_time >= v.business_hours_end
     OR extract(epoch FROM (p_time - v.business_hours_start))::integer % 7200 <> 0 THEN
    RAISE EXCEPTION 'outside_business_hours' USING ERRCODE = '22023';
  END IF;
  IF (p_date + p_time) < v_now + make_interval(hours => v.min_lead_hours) THEN
    RAISE EXCEPTION 'slot_too_soon' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_bookable_time(date, time) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compute_end_time(p_date date, p_start time, p_minutes integer)
RETURNS time
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  -- Visits never run past closing in the calendar; multi-day jobs are
  -- represented by their first-day window.
  SELECT least(
    p_date + p_start + make_interval(mins => greatest(coalesce(p_minutes, 60), 30)),
    p_date + (SELECT business_hours_end FROM public.business_settings WHERE id)
  )::time;
$$;

DROP FUNCTION IF EXISTS public.get_availability(date);

CREATE FUNCTION public.get_availability(p_date date)
RETURNS TABLE (start_time time, remaining integer, available boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v public.business_settings;
  v_now timestamp := public.business_now();
  v_open boolean;
BEGIN
  SELECT * INTO v FROM public.business_settings WHERE id = true;
  v_open := (extract(isodow FROM p_date))::smallint = ANY (v.working_days);

  RETURN QUERY
  WITH generated AS (
    SELECT g::time AS slot_start
    FROM generate_series(
      p_date::timestamp + v.business_hours_start,
      p_date::timestamp + v.business_hours_end - interval '2 hours',
      interval '2 hours'
    ) AS g
  ), calc AS (
    SELECT
      g.slot_start,
      coalesce(s.is_blocked, false) AS blocked,
      greatest(coalesce(s.capacity, v.slot_capacity) - public.slot_taken(p_date, g.slot_start), 0)::integer AS rem
    FROM generated AS g
    LEFT JOIN public.booking_slots AS s
      ON s.appointment_date = p_date AND s.appointment_start_time = g.slot_start
  )
  SELECT
    c.slot_start,
    c.rem,
    (v_open AND NOT c.blocked AND c.rem > 0
      AND p_date >= v_now::date AND p_date <= v_now::date + v.max_advance_days
      AND (p_date + c.slot_start) >= v_now + make_interval(hours => v.min_lead_hours)),
    CASE
      WHEN NOT v_open THEN 'closed'
      WHEN p_date > v_now::date + v.max_advance_days THEN 'too_far'
      WHEN (p_date + c.slot_start) < v_now + make_interval(hours => v.min_lead_hours) THEN 'too_soon'
      WHEN c.blocked THEN 'blocked'
      WHEN c.rem = 0 THEN 'full'
      ELSE NULL
    END
  FROM calc AS c
  ORDER BY c.slot_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_availability(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_availability(date) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Public catalogue (services + tasks + real stats)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.display_order, x.name), '[]'::jsonb)
  FROM (
    SELECT s.display_order, s.name, jsonb_build_object(
      'id', s.id,
      'slug', s.slug,
      'name', s.name,
      'short', coalesce(s.short_description, ''),
      'description', coalesce(s.description, ''),
      'image', s.image,
      'icon', s.icon,
      'includes', to_jsonb(s.includes),
      'startingPrice', s.starting_price,
      'bookingFee', coalesce(s.booking_fee, bs.default_booking_fee),
      'duration', coalesce(s.estimated_duration, ''),
      'rating', (
        SELECT round(avg(r.rating)::numeric, 1)
        FROM public.reviews AS r
        WHERE r.service_id = s.id AND r.visibility_status = 'published'
      ),
      'reviewCount', (
        SELECT count(*) FROM public.reviews AS r
        WHERE r.service_id = s.id AND r.visibility_status = 'published'
      ),
      'jobsDone', (
        SELECT count(*) FROM public.bookings AS b
        WHERE b.service_id = s.id AND b.booking_status = 'completed'
      ),
      'tasks', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'name', t.name,
                 'description', t.description,
                 'price', s.starting_price + t.additional_price,
                 'duration', t.estimated_duration
               ) ORDER BY t.display_order, t.name)
        FROM public.service_tasks AS t
        WHERE t.service_id = s.id AND t.active_status
      ), '[]'::jsonb)
    ) AS obj
    FROM public.services AS s
    CROSS JOIN public.business_settings AS bs
    WHERE s.active_status AND bs.id
  ) AS x;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Guest booking creation (server-side validation, pricing, slot lock)
-- -----------------------------------------------------------------------------
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
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_address text := nullif(btrim(coalesce(p_service_address, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
  v_service_price numeric(10, 2);
  v_task_price numeric(10, 2) := 0;
  v_fee numeric(10, 2);
  v_total numeric(10, 2);
  v_end time;
  v_token text;
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_settings FROM public.business_settings WHERE id = true;

  -- Field validation ------------------------------------------------------
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR char_length(v_email) > 254 OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL OR char_length(regexp_replace(v_phone, '\D', '', 'g')) NOT BETWEEN 6 AND 15 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_address IS NULL OR char_length(v_address) < 5 OR char_length(v_address) > 300 THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF v_city IS NULL OR v_area IS NULL THEN
    RAISE EXCEPTION 'invalid_city_or_area' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_problem_description, '')) > 2000 OR char_length(coalesce(p_customer_notes, '')) > 2000
     OR char_length(coalesce(p_additional_directions, '')) > 500 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_service FROM public.services AS s WHERE s.id = p_service_id AND s.active_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_service' USING ERRCODE = '22023';
  END IF;

  IF p_task_id IS NOT NULL THEN
    SELECT * INTO v_task FROM public.service_tasks AS t
    WHERE t.id = p_task_id AND t.service_id = p_service_id AND t.active_status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_task' USING ERRCODE = '22023';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.service_tasks t WHERE t.service_id = p_service_id AND t.active_status) THEN
    RAISE EXCEPTION 'task_required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_bookable_time(p_appointment_date, p_appointment_start_time);

  IF NOT EXISTS (
    SELECT 1 FROM public.service_areas AS a
    WHERE a.active_status AND lower(a.city) = lower(v_city) AND lower(a.area_name) = lower(v_area)
  ) THEN
    RAISE EXCEPTION 'area_not_served' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: a repeated submit with the same key is rejected -----------
  IF p_idempotency_key IS NOT NULL THEN
    IF char_length(p_idempotency_key) < 16 OR char_length(p_idempotency_key) > 100 THEN
      RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings AS b WHERE b.idempotency_key = p_idempotency_key) THEN
      RAISE EXCEPTION 'duplicate_submission' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Same customer, same service, same slot, still active => duplicate.
  IF EXISTS (
    SELECT 1 FROM public.bookings AS b
    WHERE lower(b.guest_email) = v_email
      AND b.service_id = p_service_id
      AND b.appointment_date = p_appointment_date
      AND b.appointment_start_time = p_appointment_start_time
      AND public.booking_holds_slot(b.booking_status, b.payment_expires_at)
  ) THEN
    RAISE EXCEPTION 'duplicate_booking' USING ERRCODE = '23505';
  END IF;

  -- Server-side pricing ---------------------------------------------------
  v_service_price := v_service.starting_price;
  v_task_price := coalesce(v_task.additional_price, 0);
  v_fee := coalesce(v_service.booking_fee, v_settings.default_booking_fee);
  v_total := v_service_price + v_task_price + v_fee;
  v_end := public.compute_end_time(
    p_appointment_date, p_appointment_start_time,
    coalesce(v_task.duration_minutes, v_service.duration_minutes, v_settings.default_service_duration_minutes)
  );

  -- Slot reservation: the slot row lock serialises concurrent checkouts ----
  INSERT INTO public.booking_slots AS bs (appointment_date, appointment_start_time, capacity)
  VALUES (p_appointment_date, p_appointment_start_time, v_settings.slot_capacity)
  ON CONFLICT ON CONSTRAINT booking_slots_unique DO NOTHING;

  SELECT * INTO v_slot FROM public.booking_slots AS bs
  WHERE bs.appointment_date = p_appointment_date AND bs.appointment_start_time = p_appointment_start_time
  FOR UPDATE;

  IF v_slot.is_blocked THEN
    RAISE EXCEPTION 'slot_blocked' USING ERRCODE = '22023';
  END IF;

  v_taken := public.slot_taken(p_appointment_date, p_appointment_start_time);
  IF v_taken >= v_slot.capacity THEN
    RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '22023';
  END IF;

  -- Creation --------------------------------------------------------------
  v_token := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');

  INSERT INTO public.bookings AS b (
    booking_reference, idempotency_key, lookup_token_hash, customer_user_id,
    guest_name, guest_email, guest_phone,
    service_id, service_name_snapshot, task_id, task_name_snapshot, problem_description,
    service_address, city, area, street, building_number, apartment_number, postal_code,
    additional_directions, appointment_date, appointment_start_time, appointment_end_time,
    booking_status, payment_status, payment_expires_at,
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
    v_address, v_city, v_area,
    nullif(btrim(coalesce(p_street, '')), ''), nullif(btrim(coalesce(p_building_number, '')), ''),
    nullif(btrim(coalesce(p_apartment_number, '')), ''), nullif(btrim(coalesce(p_postal_code, '')), ''),
    nullif(btrim(coalesce(p_additional_directions, '')), ''),
    p_appointment_date, p_appointment_start_time, v_end,
    'pending_payment', 'unpaid', now() + make_interval(mins => v_settings.payment_hold_minutes),
    v_service_price, v_task_price, v_fee, 0,
    v_total, v_settings.currency, nullif(btrim(coalesce(p_customer_notes, '')), '')
  )
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, NULL, 'pending_payment', 'booking_created', v_uid,
          'Booking submitted; awaiting online payment');

  RETURN QUERY SELECT
    v_booking.id, v_booking.booking_reference, v_booking.booking_status, v_booking.payment_status,
    v_booking.total_amount, v_booking.currency, v_booking.appointment_date,
    v_booking.appointment_start_time, v_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Guest lookup / cancel / review (reference + unguessable token)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_booking_by_token(p_reference text, p_token text)
RETURNS public.bookings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_reference IS NULL OR p_token IS NULL OR char_length(p_token) < 32 THEN
    RAISE EXCEPTION 'invalid_lookup' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings AS b
  WHERE b.booking_reference = upper(btrim(p_reference))
    AND b.lookup_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.find_booking_by_token(text, text) FROM PUBLIC, anon, authenticated;

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
  v_review jsonb;
  v_hold boolean;
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'status', h.new_status, 'action', h.action, 'at', h.created_at
         ) ORDER BY h.created_at), '[]'::jsonb)
  INTO v_history
  FROM public.booking_status_history AS h
  WHERE h.booking_id = v_booking.id;

  SELECT jsonb_build_object('rating', r.rating, 'review_text', r.review_text, 'created_at', r.created_at)
  INTO v_review FROM public.reviews AS r WHERE r.booking_id = v_booking.id;

  v_hold := public.booking_holds_slot(v_booking.booking_status, v_booking.payment_expires_at);

  RETURN jsonb_build_object(
    'booking_reference', v_booking.booking_reference,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'service_name', v_booking.service_name_snapshot,
    'task_name', v_booking.task_name_snapshot,
    'problem_description', v_booking.problem_description,
    'appointment_date', v_booking.appointment_date,
    'appointment_start_time', v_booking.appointment_start_time,
    'appointment_end_time', v_booking.appointment_end_time,
    'service_price', v_booking.service_price_snapshot + v_booking.additional_task_price_snapshot,
    'booking_fee', v_booking.booking_fee_snapshot,
    'discount_amount', v_booking.discount_amount,
    'total_amount', v_booking.total_amount,
    'currency', v_booking.currency,
    'contact_name', v_booking.guest_name,
    'contact_email', v_booking.guest_email,
    'contact_phone', v_booking.guest_phone,
    'service_address', v_booking.service_address,
    'city', v_booking.city,
    'area', v_booking.area,
    'technician', (SELECT t.full_name FROM public.technicians AS t WHERE t.id = v_booking.assigned_technician_id),
    'payment_expires_at', v_booking.payment_expires_at,
    'can_pay', v_booking.booking_status = 'pending_payment' AND v_booking.payment_status IN ('unpaid', 'pending', 'failed') AND v_hold,
    'can_cancel', v_booking.booking_status IN ('pending_payment', 'confirmed', 'technician_assigned')
                  AND (v_booking.appointment_date + v_booking.appointment_start_time) > public.business_now(),
    'can_review', v_booking.booking_status = 'completed' AND v_review IS NULL,
    'review', v_review,
    'attachments', (SELECT count(*) FROM public.booking_attachments a WHERE a.booking_id = v_booking.id),
    'cancellation_reason', v_booking.cancellation_reason,
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
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Cancelled by customer');
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token);
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = v_booking.id FOR UPDATE;

  IF v_booking.booking_status NOT IN ('pending_payment', 'confirmed', 'technician_assigned') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = '22023';
  END IF;
  IF (v_booking.appointment_date + v_booking.appointment_start_time) <= public.business_now() THEN
    RAISE EXCEPTION 'appointment_already_passed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings AS b
  SET booking_status = 'cancelled',
      payment_status = CASE WHEN b.payment_status IN ('unpaid', 'pending') THEN 'cancelled' ELSE b.payment_status END,
      cancelled_at = now(),
      cancellation_reason = left(v_reason, 500)
  WHERE b.id = v_booking.id;

  UPDATE public.technician_assignments a SET assignment_status = 'removed'
  WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_booking.booking_status, 'cancelled', 'customer_cancelled', (SELECT auth.uid()),
          left(v_reason, 500) || CASE WHEN v_booking.payment_status = 'paid' THEN ' (paid booking: refund required)' ELSE '' END);

  RETURN jsonb_build_object('booking_reference', v_booking.booking_reference, 'booking_status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_review(p_reference text, p_token text, p_rating integer, p_text text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token);
  IF v_booking.booking_status <> 'completed' THEN
    RAISE EXCEPTION 'review_not_allowed' USING ERRCODE = '22023';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_text, '')) > 2000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.reviews (booking_id, customer_user_id, technician_id, service_id, rating, review_text, visibility_status)
  VALUES (v_booking.id, v_booking.customer_user_id, v_booking.assigned_technician_id, v_booking.service_id,
          p_rating, nullif(btrim(coalesce(p_text, '')), ''), 'pending');
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'review_already_submitted' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(text, text, integer, text) TO anon, authenticated;

-- Attachments are uploaded by the `upload-attachment` edge function (API key)
-- after it verifies reference + token; it registers metadata here.
DROP FUNCTION IF EXISTS public.attach_booking_file(text, text, text, text, text, integer);

CREATE FUNCTION public.attach_booking_file(
  p_reference text, p_token text, p_storage_path text, p_original_file_name text, p_file_type text, p_file_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_id uuid;
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token);
  IF p_file_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'unsupported_file_type' USING ERRCODE = '22023';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 5242880 THEN
    RAISE EXCEPTION 'invalid_file_size' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.booking_attachments a WHERE a.booking_id = v_booking.id) >= 5 THEN
    RAISE EXCEPTION 'too_many_attachments' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.booking_attachments (booking_id, storage_path, original_file_name, file_type, file_size)
  VALUES (v_booking.id, p_storage_path, left(p_original_file_name, 200), p_file_type, p_file_size)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_booking_file(text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Checkout (called only by the `create-checkout` edge function)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_checkout(p_reference text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_open jsonb;
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token);
  IF v_booking.payment_status = 'paid' THEN
    RAISE EXCEPTION 'already_paid' USING ERRCODE = '22023';
  END IF;
  IF v_booking.booking_status <> 'pending_payment' THEN
    RAISE EXCEPTION 'booking_not_payable' USING ERRCODE = '22023';
  END IF;
  IF NOT public.booking_holds_slot(v_booking.booking_status, v_booking.payment_expires_at) THEN
    RAISE EXCEPTION 'payment_window_expired' USING ERRCODE = '22023';
  END IF;

  -- Re-use a recent open session instead of creating a second one.
  SELECT jsonb_build_object('checkout_session_id', p.checkout_session_id, 'url', p.transaction_metadata ->> 'checkout_url')
  INTO v_open
  FROM public.payments p
  WHERE p.booking_id = v_booking.id AND p.payment_status = 'pending'
    AND p.transaction_metadata ? 'checkout_url'
    AND p.created_at > now() - interval '25 minutes'
  ORDER BY p.created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'service_name', v_booking.service_name_snapshot,
    'task_name', v_booking.task_name_snapshot,
    'service_amount', v_booking.service_price_snapshot + v_booking.additional_task_price_snapshot - v_booking.discount_amount,
    'booking_fee', v_booking.booking_fee_snapshot,
    'total_amount', v_booking.total_amount,
    'currency', v_booking.currency,
    'email', v_booking.guest_email,
    'service_id', v_booking.service_id,
    'appointment_date', v_booking.appointment_date,
    'appointment_start_time', v_booking.appointment_start_time,
    'open_session', v_open
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_checkout(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_checkout_session(
  p_booking_id uuid, p_provider text, p_checkout_session_id text, p_checkout_url text,
  p_amount numeric, p_currency text, p_environment text, p_lookup_token_cipher text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.payments (booking_id, customer_user_id, provider, checkout_session_id, amount, currency,
                               payment_status, transaction_metadata)
  VALUES (p_booking_id, v_booking.customer_user_id, p_provider, p_checkout_session_id, p_amount, upper(p_currency),
          'pending', jsonb_build_object('checkout_url', p_checkout_url, 'environment', p_environment))
  ON CONFLICT (provider, checkout_session_id) WHERE checkout_session_id IS NOT NULL DO NOTHING;

  UPDATE public.bookings b
  SET payment_status = CASE WHEN b.payment_status IN ('unpaid', 'failed') THEN 'pending' ELSE b.payment_status END,
      lookup_token_cipher = coalesce(b.lookup_token_cipher, p_lookup_token_cipher)
  WHERE b.id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_checkout_session(uuid, text, text, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;

-- Stripe Price cache: Checkout through InsForge takes Price IDs, so the edge
-- function creates (once) and re-uses a Price for each exact amount.
CREATE TABLE IF NOT EXISTS public.stripe_catalog_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  product_key text NOT NULL,
  product_id text NOT NULL,
  unit_amount integer,
  currency text,
  price_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_catalog_cache_product_key
  ON public.stripe_catalog_cache (environment, product_key) WHERE price_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_catalog_cache_price_key
  ON public.stripe_catalog_cache (environment, product_key, unit_amount, currency) WHERE price_id IS NOT NULL;

ALTER TABLE public.stripe_catalog_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_catalog_cache FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Payment fulfilment (verified webhook rows only)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_payment_paid(uuid, text, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.record_payment_success(
  p_booking_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_checkout_session_id text,
  p_amount numeric,
  p_currency text,
  p_payment_method text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_payment public.payments;
  v_slot public.booking_slots;
  v_capacity integer;
  v_outcome text;
  v_ref text := coalesce(p_provider_transaction_id, p_checkout_session_id);
BEGIN
  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Upsert the payment row for this checkout session / transaction.
  SELECT * INTO v_payment FROM public.payments p
  WHERE p.provider = p_provider
    AND ((p_checkout_session_id IS NOT NULL AND p.checkout_session_id = p_checkout_session_id)
      OR (p_provider_transaction_id IS NOT NULL AND p.provider_transaction_id = p_provider_transaction_id))
  ORDER BY p.created_at LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_payment.payment_status = 'succeeded' THEN
    RETURN 'duplicate_ignored';
  END IF;

  IF FOUND THEN
    UPDATE public.payments p
    SET payment_status = 'succeeded',
        provider_transaction_id = coalesce(p_provider_transaction_id, p.provider_transaction_id),
        amount = p_amount,
        currency = upper(p_currency),
        payment_method = coalesce(p_payment_method, p.payment_method),
        transaction_metadata = p.transaction_metadata || coalesce(p_metadata, '{}'::jsonb),
        paid_at = now()
    WHERE p.id = v_payment.id
    RETURNING * INTO v_payment;
  ELSE
    INSERT INTO public.payments (booking_id, customer_user_id, provider, provider_transaction_id, checkout_session_id,
                                 amount, currency, payment_method, payment_status, transaction_metadata, paid_at)
    VALUES (v_booking.id, v_booking.customer_user_id, p_provider, p_provider_transaction_id, p_checkout_session_id,
            p_amount, upper(p_currency), p_payment_method, 'succeeded', coalesce(p_metadata, '{}'::jsonb), now())
    RETURNING * INTO v_payment;
  END IF;

  -- Already paid through another session: keep the money traceable.
  IF v_booking.payment_status = 'paid' THEN
    UPDATE public.payments p SET transaction_metadata = p.transaction_metadata || '{"duplicate_payment": true}'::jsonb
    WHERE p.id = v_payment.id;
    INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
    VALUES (v_booking.id, v_booking.booking_status, v_booking.booking_status, 'duplicate_payment',
            'Second successful payment ' || v_ref || ' received; refund required');
    RETURN 'duplicate_payment';
  END IF;

  -- Amount / currency must match the server-calculated total exactly.
  IF upper(p_currency) <> upper(v_booking.currency) OR abs(p_amount - v_booking.total_amount) > 0.005 THEN
    UPDATE public.payments p SET transaction_metadata = p.transaction_metadata
      || jsonb_build_object('amount_mismatch', true, 'expected', v_booking.total_amount, 'expected_currency', v_booking.currency)
    WHERE p.id = v_payment.id;
    INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
    VALUES (v_booking.id, v_booking.booking_status, v_booking.booking_status, 'payment_amount_mismatch',
            format('Received %s %s, expected %s %s (%s)', p_amount, upper(p_currency), v_booking.total_amount, v_booking.currency, v_ref));
    RETURN 'amount_mismatch';
  END IF;

  -- Booking cancelled/rejected before payment landed.
  IF v_booking.booking_status IN ('cancelled', 'rejected') THEN
    UPDATE public.bookings b SET payment_status = 'paid' WHERE b.id = v_booking.id;
    INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
    VALUES (v_booking.id, v_booking.booking_status, v_booking.booking_status, 'payment_after_cancellation',
            'Payment ' || v_ref || ' received after the booking was closed; refund required');
    RETURN 'paid_after_cancellation';
  END IF;

  v_outcome := 'confirmed';

  -- Payment arrived after the hold expired: re-check the slot.
  IF v_booking.booking_status = 'payment_failed'
     OR NOT public.booking_holds_slot(v_booking.booking_status, v_booking.payment_expires_at) THEN
    SELECT * INTO v_slot FROM public.booking_slots s
    WHERE s.appointment_date = v_booking.appointment_date AND s.appointment_start_time = v_booking.appointment_start_time
    FOR UPDATE;
    v_capacity := coalesce(v_slot.capacity, (SELECT slot_capacity FROM public.business_settings WHERE id));
    IF coalesce(v_slot.is_blocked, false)
       OR public.slot_taken(v_booking.appointment_date, v_booking.appointment_start_time, v_booking.id) >= v_capacity THEN
      UPDATE public.bookings b SET payment_status = 'paid', booking_status = 'payment_failed' WHERE b.id = v_booking.id;
      INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
      VALUES (v_booking.id, v_booking.booking_status, 'payment_failed', 'paid_slot_unavailable',
              'Payment ' || v_ref || ' received after the hold expired and the slot is now full; reschedule or refund');
      RETURN 'paid_slot_unavailable';
    END IF;
    v_outcome := 'confirmed_late';
  END IF;

  UPDATE public.bookings AS b
  SET payment_status = 'paid', booking_status = 'confirmed', payment_expires_at = NULL
  WHERE b.id = v_booking.id;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
  VALUES (v_booking.id, v_booking.booking_status, 'confirmed', 'payment_verified',
          format('Verified %s payment %s for %s %s', p_provider, v_ref, p_amount, upper(p_currency)));

  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_success(uuid, text, text, text, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_payment_failure(
  p_booking_id uuid, p_provider text, p_checkout_session_id text, p_payment_status text, p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_payment_status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments p
  SET payment_status = p_payment_status,
      transaction_metadata = p.transaction_metadata || jsonb_build_object('failure_reason', p_reason)
  WHERE p.provider = p_provider AND p.checkout_session_id = p_checkout_session_id AND p.payment_status = 'pending';

  IF v_booking.payment_status = 'paid' OR v_booking.booking_status <> 'pending_payment' THEN
    RETURN 'ignored';
  END IF;

  -- Another checkout session for this booking may still be open.
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = v_booking.id AND p.payment_status = 'pending'
             AND p.created_at > now() - interval '25 minutes') THEN
    RETURN 'other_session_open';
  END IF;

  UPDATE public.bookings b
  SET booking_status = 'payment_failed', payment_status = p_payment_status
  WHERE b.id = v_booking.id;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
  VALUES (v_booking.id, v_booking.booking_status, 'payment_failed',
          CASE WHEN p_payment_status = 'failed' THEN 'payment_failed' ELSE 'payment_cancelled' END, p_reason);
  RETURN 'payment_failed';
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_failure(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_refund(p_provider text, p_provider_transaction_id text, p_refunded_total numeric, p_currency text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_payment public.payments;
  v_full boolean;
BEGIN
  SELECT * INTO v_payment FROM public.payments p
  WHERE p.provider = p_provider AND p.provider_transaction_id = p_provider_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'payment_not_found';
  END IF;
  IF p_refunded_total <= v_payment.refunded_amount THEN
    RETURN 'duplicate_ignored';
  END IF;
  v_full := p_refunded_total >= v_payment.amount;

  UPDATE public.payments p
  SET refunded_amount = least(p_refunded_total, p.amount),
      refund_status = CASE WHEN v_full THEN 'full' ELSE 'partial' END,
      payment_status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END
  WHERE p.id = v_payment.id;

  UPDATE public.bookings b
  SET payment_status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END
  WHERE b.id = v_payment.booking_id;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
  SELECT b.id, b.booking_status, b.booking_status, 'refund_recorded',
         format('%s refund of %s %s recorded (%s)', CASE WHEN v_full THEN 'Full' ELSE 'Partial' END,
                p_refunded_total, upper(p_currency), p_provider_transaction_id)
  FROM public.bookings b WHERE b.id = v_payment.booking_id;
  RETURN CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_refund(text, text, numeric, text) FROM PUBLIC, anon, authenticated;

-- Durable event ledger so each provider event is applied exactly once.
CREATE TABLE IF NOT EXISTS public.payment_event_log (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  outcome text,
  error_message text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_event_id)
);

ALTER TABLE public.payment_event_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_event_log FROM anon, authenticated;
GRANT SELECT ON public.payment_event_log TO authenticated;
CREATE POLICY payment_event_log_admin_read ON public.payment_event_log
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.fixora_handle_payment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_obj jsonb;
  v_booking_id uuid;
  v_outcome text;
  v_inserted integer;
BEGIN
  IF NEW.provider <> 'stripe' OR NEW.processing_status <> 'processed' THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type NOT IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded',
                            'checkout.session.async_payment_failed', 'checkout.session.expired', 'charge.refunded') THEN
    RETURN NEW;
  END IF;

  v_obj := NEW.payload -> 'data' -> 'object';
  BEGIN
    v_booking_id := nullif(v_obj -> 'metadata' ->> 'booking_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_booking_id := NULL;
  END;

  IF NEW.event_type <> 'charge.refunded' AND v_booking_id IS NULL THEN
    RETURN NEW; -- not a Fixora checkout
  END IF;

  INSERT INTO public.payment_event_log (provider, provider_event_id, event_type, booking_id)
  VALUES (NEW.provider, NEW.provider_event_id, NEW.event_type, v_booking_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN NEW; -- duplicate delivery
  END IF;

  BEGIN
    IF NEW.event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') THEN
      IF v_obj ->> 'payment_status' = 'paid' THEN
        v_outcome := public.record_payment_success(
          v_booking_id, 'stripe', v_obj ->> 'payment_intent', v_obj ->> 'id',
          ((v_obj ->> 'amount_total')::numeric / 100), coalesce(v_obj ->> 'currency', 'usd'),
          coalesce(v_obj -> 'payment_method_types' ->> 0, 'card'),
          jsonb_build_object('environment', NEW.environment, 'event_id', NEW.provider_event_id,
                             'customer_email', v_obj -> 'customer_details' ->> 'email'));
      ELSE
        UPDATE public.payments p SET payment_status = 'pending'
        WHERE p.provider = 'stripe' AND p.checkout_session_id = v_obj ->> 'id';
        UPDATE public.bookings b SET payment_status = 'pending'
        WHERE b.id = v_booking_id AND b.payment_status IN ('unpaid', 'failed');
        v_outcome := 'awaiting_async_payment';
      END IF;
    ELSIF NEW.event_type = 'checkout.session.async_payment_failed' THEN
      v_outcome := public.record_payment_failure(v_booking_id, 'stripe', v_obj ->> 'id', 'failed', 'Asynchronous payment failed');
    ELSIF NEW.event_type = 'checkout.session.expired' THEN
      v_outcome := public.record_payment_failure(v_booking_id, 'stripe', v_obj ->> 'id', 'cancelled', 'Checkout session expired');
    ELSIF NEW.event_type = 'charge.refunded' THEN
      v_outcome := public.record_refund('stripe', v_obj ->> 'payment_intent',
                                        ((v_obj ->> 'amount_refunded')::numeric / 100), coalesce(v_obj ->> 'currency', 'usd'));
    END IF;

    UPDATE public.payment_event_log l SET outcome = v_outcome
    WHERE l.provider = NEW.provider AND l.provider_event_id = NEW.provider_event_id;
  EXCEPTION WHEN others THEN
    UPDATE public.payment_event_log l SET outcome = 'error', error_message = SQLERRM
    WHERE l.provider = NEW.provider AND l.provider_event_id = NEW.provider_event_id;
    PERFORM public.enqueue_admin_alert(v_booking_id, 'booking_problem',
      'Payment webhook ' || NEW.event_type || ' failed to apply: ' || SQLERRM);
  END;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Email outbox
-- -----------------------------------------------------------------------------
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_delivery_status_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_delivery_status_check
  CHECK (delivery_status IN ('queued', 'sending', 'sent', 'failed', 'skipped'));
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_recipient_type_check
  CHECK (recipient_type IN ('customer', 'admin'));

CREATE INDEX IF NOT EXISTS email_logs_queue_idx ON public.email_logs (next_attempt_at)
  WHERE delivery_status IN ('queued', 'sending');

CREATE OR REPLACE FUNCTION public.email_subject(p_type text, p_reference text, p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'booking_confirmed' THEN 'Booking confirmed — ' || p_reference
    WHEN 'payment_receipt' THEN 'Payment receipt — ' || p_reference
    WHEN 'booking_cancelled' THEN 'Booking cancelled — ' || p_reference
    WHEN 'booking_rejected' THEN 'Update on your booking — ' || p_reference
    WHEN 'booking_rescheduled' THEN 'Your booking has been rescheduled — ' || p_reference
    WHEN 'technician_assigned' THEN 'Your technician is assigned — ' || p_reference
    WHEN 'service_completed' THEN 'Job completed — ' || p_reference
    WHEN 'review_request' THEN 'How did we do? Review your Fixora visit'
    WHEN 'refund_processed' THEN 'Refund processed — ' || p_reference
    WHEN 'admin_new_booking' THEN 'New confirmed booking ' || p_reference
    WHEN 'admin_booking_cancelled' THEN 'Booking cancelled by customer: ' || p_reference
    WHEN 'admin_payment_failed' THEN 'Payment failed: ' || p_reference
    WHEN 'admin_booking_problem' THEN 'Action needed: ' || coalesce(p_reference, 'Fixora system alert')
    WHEN 'admin_contact_message' THEN 'New contact message from ' || coalesce(p_payload ->> 'name', 'a visitor')
    ELSE 'Fixora notification'
  END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(p_booking_id uuid, p_type text, p_recipient_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.business_settings;
  v_booking public.bookings;
  v_to text;
  v_status text := 'queued';
  v_id uuid;
BEGIN
  SELECT * INTO v_settings FROM public.business_settings WHERE id = true;
  IF p_booking_id IS NOT NULL THEN
    SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id;
  END IF;

  IF p_recipient_type = 'admin' THEN
    v_to := coalesce(nullif(btrim(v_settings.contact_email), ''), (SELECT admin_email FROM public.app_config WHERE id));
    IF NOT v_settings.notify_admin_email THEN v_status := 'skipped'; END IF;
  ELSE
    v_to := coalesce(v_booking.guest_email, (SELECT u.email FROM auth.users u WHERE u.id = v_booking.customer_user_id));
    IF NOT v_settings.notify_customer_email THEN v_status := 'skipped'; END IF;
  END IF;

  IF v_to IS NULL THEN
    v_status := 'skipped';
    v_to := 'unknown';
  END IF;

  INSERT INTO public.email_logs (booking_id, recipient_email, email_type, subject, delivery_status, recipient_type, payload,
                                 error_message)
  VALUES (p_booking_id, v_to, p_type, public.email_subject(p_type, v_booking.booking_reference, p_payload), v_status,
          p_recipient_type, coalesce(p_payload, '{}'::jsonb),
          CASE WHEN v_status = 'skipped' THEN 'Notifications disabled or no recipient' END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_email(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_admin_alert(p_booking_id uuid, p_kind text, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.enqueue_email(p_booking_id, 'admin_' || p_kind, 'admin', jsonb_build_object('message', p_message));
  INSERT INTO public.notifications (user_id, booking_id, notification_type, title, message)
  VALUES (NULL, p_booking_id, p_kind, initcap(replace(p_kind, '_', ' ')), left(p_message, 1000));
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_admin_alert(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Every audit event can fan out to customer/admin emails.
CREATE OR REPLACE FUNCTION public.fixora_history_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_payload jsonb := jsonb_build_object('notes', NEW.notes, 'action', NEW.action);
BEGIN
  CASE NEW.action
    WHEN 'payment_verified' THEN
      PERFORM public.enqueue_email(NEW.booking_id, 'booking_confirmed', 'customer', v_payload);
      PERFORM public.enqueue_email(NEW.booking_id, 'payment_receipt', 'customer', v_payload);
      PERFORM public.enqueue_email(NEW.booking_id, 'admin_new_booking', 'admin', v_payload);
      INSERT INTO public.notifications (user_id, booking_id, notification_type, title, message)
      VALUES (NULL, NEW.booking_id, 'new_booking', 'New confirmed booking', coalesce(NEW.notes, ''));
    WHEN 'customer_cancelled' THEN
      PERFORM public.enqueue_email(NEW.booking_id, 'booking_cancelled', 'customer', v_payload);
      PERFORM public.enqueue_email(NEW.booking_id, 'admin_booking_cancelled', 'admin', v_payload);
    WHEN 'payment_failed' THEN
      PERFORM public.enqueue_admin_alert(NEW.booking_id, 'payment_failed', coalesce(NEW.notes, 'Payment failed'));
    WHEN 'payment_amount_mismatch', 'paid_slot_unavailable', 'payment_after_cancellation', 'duplicate_payment' THEN
      PERFORM public.enqueue_admin_alert(NEW.booking_id, 'booking_problem', coalesce(NEW.notes, NEW.action));
    WHEN 'rescheduled' THEN
      PERFORM public.enqueue_email(NEW.booking_id, 'booking_rescheduled', 'customer', v_payload);
    WHEN 'technician_assigned', 'technician_reassigned' THEN
      PERFORM public.enqueue_email(NEW.booking_id, 'technician_assigned', 'customer', v_payload);
    WHEN 'refund_recorded' THEN
      PERFORM public.enqueue_email(NEW.booking_id, 'refund_processed', 'customer', v_payload);
    WHEN 'status_changed' THEN
      IF NEW.new_status = 'completed' THEN
        PERFORM public.enqueue_email(NEW.booking_id, 'service_completed', 'customer', v_payload);
        PERFORM public.enqueue_email(NEW.booking_id, 'review_request', 'customer', v_payload);
      ELSIF NEW.new_status = 'cancelled' THEN
        PERFORM public.enqueue_email(NEW.booking_id, 'booking_cancelled', 'customer', v_payload);
      ELSIF NEW.new_status = 'rejected' THEN
        PERFORM public.enqueue_email(NEW.booking_id, 'booking_rejected', 'customer', v_payload);
      END IF;
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_status_history_notify ON public.booking_status_history;
CREATE TRIGGER booking_status_history_notify
  AFTER INSERT ON public.booking_status_history
  FOR EACH ROW EXECUTE FUNCTION public.fixora_history_notifications();

-- Webhook trigger is created after enqueue_admin_alert exists.
DROP TRIGGER IF EXISTS fixora_handle_payment_webhook ON payments.webhook_events;
CREATE TRIGGER fixora_handle_payment_webhook
  AFTER INSERT OR UPDATE OF processing_status ON payments.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.fixora_handle_payment_webhook();

-- Queue worker API (edge function `process-email-queue`, API key only).
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  WITH picked AS (
    SELECT e.id FROM public.email_logs e
    WHERE (e.delivery_status = 'queued' AND e.next_attempt_at <= now())
       OR (e.delivery_status = 'sending' AND e.last_attempt_at < now() - interval '10 minutes')
    ORDER BY e.created_at
    LIMIT greatest(1, least(p_limit, 25))
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.email_logs e
    SET delivery_status = 'sending', attempts = e.attempts + 1, last_attempt_at = now()
    FROM picked WHERE e.id = picked.id
    RETURNING e.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'email_type', u.email_type, 'recipient_email', u.recipient_email, 'recipient_type', u.recipient_type,
    'subject', u.subject, 'payload', u.payload, 'attempts', u.attempts,
    'booking', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', b.id, 'booking_reference', b.booking_reference, 'booking_status', b.booking_status,
      'payment_status', b.payment_status, 'guest_name', b.guest_name, 'guest_email', b.guest_email,
      'guest_phone', b.guest_phone, 'service_name', b.service_name_snapshot, 'task_name', b.task_name_snapshot,
      'problem_description', b.problem_description,
      'service_address', b.service_address, 'city', b.city, 'area', b.area,
      'appointment_date', b.appointment_date, 'appointment_start_time', b.appointment_start_time,
      'appointment_end_time', b.appointment_end_time, 'service_price', b.service_price_snapshot + b.additional_task_price_snapshot,
      'booking_fee', b.booking_fee_snapshot, 'discount_amount', b.discount_amount, 'total_amount', b.total_amount,
      'currency', b.currency, 'cancellation_reason', b.cancellation_reason, 'lookup_token_cipher', b.lookup_token_cipher,
      'technician_name', t.full_name, 'technician_phone', t.phone,
      'payment', (SELECT jsonb_build_object('amount', p.amount, 'currency', p.currency, 'method', p.payment_method,
                                            'transaction_id', p.provider_transaction_id, 'paid_at', p.paid_at,
                                            'refunded_amount', p.refunded_amount)
                  FROM public.payments p WHERE p.booking_id = b.id AND p.payment_status IN ('succeeded', 'refunded', 'partially_refunded')
                  ORDER BY p.paid_at DESC NULLS LAST LIMIT 1)
    ) END
  )), '[]'::jsonb)
  INTO v_rows
  FROM upd u
  LEFT JOIN public.bookings b ON b.id = u.booking_id
  LEFT JOIN public.technicians t ON t.id = b.assigned_technician_id;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_batch(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_email(p_id uuid, p_success boolean, p_provider_message_id text, p_error text, p_retry boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.email_logs e
  SET delivery_status = CASE WHEN p_success THEN 'sent'
                             WHEN p_retry AND e.attempts < 3 THEN 'queued'
                             ELSE 'failed' END,
      provider_message_id = coalesce(p_provider_message_id, e.provider_message_id),
      error_message = CASE WHEN p_success THEN NULL ELSE left(p_error, 1000) END,
      sent_at = CASE WHEN p_success THEN now() ELSE e.sent_at END,
      next_attempt_at = CASE WHEN p_retry AND NOT p_success THEN now() + make_interval(mins => 5 * e.attempts * e.attempts) ELSE e.next_attempt_at END
  WHERE e.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_email(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_retry_email(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.email_logs e
  SET delivery_status = 'queued', next_attempt_at = now(), attempts = 0, error_message = NULL
  WHERE e.id = p_id AND e.delivery_status IN ('failed', 'skipped');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_retry_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_retry_email(uuid) TO authenticated;

-- Releases unpaid holds; run by the scheduled queue worker.
CREATE OR REPLACE FUNCTION public.expire_stale_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT b.id, b.booking_status FROM public.bookings b
    WHERE b.booking_status = 'pending_payment'
      AND b.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
      AND b.payment_expires_at < now() - interval '5 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings b
    SET booking_status = 'payment_failed',
        payment_status = CASE WHEN b.payment_status = 'failed' THEN 'failed' ELSE 'cancelled' END
    WHERE b.id = v_row.id;
    INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, notes)
    VALUES (v_row.id, v_row.booking_status, 'payment_failed', 'payment_expired',
            'Payment was not completed within the hold window; slot released');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_bookings() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Admin booking operations
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_status_transition(p_from text, p_to text, p_payment_status text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_from = p_to THEN
    RAISE EXCEPTION 'status_unchanged' USING ERRCODE = '22023';
  END IF;
  IF p_to = 'confirmed' AND p_payment_status <> 'paid' THEN
    RAISE EXCEPTION 'cannot_confirm_unpaid_booking' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_from = 'pending_payment' AND p_to IN ('cancelled', 'rejected', 'payment_failed', 'confirmed')) OR
    (p_from = 'payment_failed' AND p_to IN ('cancelled', 'rejected', 'confirmed')) OR
    (p_from = 'confirmed' AND p_to IN ('in_progress', 'cancelled', 'rejected')) OR
    (p_from = 'technician_assigned' AND p_to IN ('in_progress', 'cancelled', 'confirmed')) OR
    (p_from = 'in_progress' AND p_to IN ('completed', 'cancelled', 'technician_assigned'))
  ) THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> %', p_from, p_to USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_booking_status(p_booking_id uuid, p_new_status text, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_previous text;
  v_actor uuid := (SELECT auth.uid());
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_new_status NOT IN ('pending_payment', 'confirmed', 'technician_assigned', 'in_progress',
                          'completed', 'cancelled', 'rejected', 'payment_failed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_new_status = 'technician_assigned' THEN
    RAISE EXCEPTION 'use_assign_technician' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_previous := v_booking.booking_status;

  PERFORM public.assert_status_transition(v_previous, p_new_status, v_booking.payment_status);

  IF p_new_status = 'in_progress' AND v_booking.assigned_technician_id IS NULL THEN
    RAISE EXCEPTION 'assign_technician_first' USING ERRCODE = '22023';
  END IF;
  IF p_new_status = 'confirmed' AND v_previous = 'technician_assigned' THEN
    -- returning to confirmed means the technician was removed
    UPDATE public.technician_assignments a SET assignment_status = 'removed'
    WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';
  END IF;
  IF p_new_status = 'confirmed' AND v_previous IN ('payment_failed', 'pending_payment') THEN
    IF public.slot_taken(v_booking.appointment_date, v_booking.appointment_start_time, v_booking.id)
       >= coalesce((SELECT s.capacity FROM public.booking_slots s WHERE s.appointment_date = v_booking.appointment_date
                     AND s.appointment_start_time = v_booking.appointment_start_time),
                   (SELECT slot_capacity FROM public.business_settings WHERE id)) THEN
      RAISE EXCEPTION 'slot_unavailable_reschedule_first' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.bookings AS b
  SET booking_status = p_new_status,
      assigned_technician_id = CASE WHEN p_new_status = 'confirmed' AND v_previous = 'technician_assigned' THEN NULL ELSE b.assigned_technician_id END,
      payment_expires_at = CASE WHEN p_new_status = 'confirmed' THEN NULL ELSE b.payment_expires_at END,
      payment_status = CASE WHEN p_new_status IN ('cancelled', 'rejected') AND b.payment_status IN ('unpaid', 'pending') THEN 'cancelled' ELSE b.payment_status END,
      completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE b.completed_at END,
      cancelled_at = CASE WHEN p_new_status IN ('cancelled', 'rejected') THEN now() ELSE b.cancelled_at END,
      cancellation_reason = CASE WHEN p_new_status IN ('cancelled', 'rejected') THEN coalesce(v_notes, b.cancellation_reason) ELSE b.cancellation_reason END
  WHERE b.id = p_booking_id
  RETURNING * INTO v_booking;

  IF p_new_status = 'completed' THEN
    UPDATE public.technician_assignments a SET assignment_status = 'completed'
    WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';
  ELSIF p_new_status IN ('cancelled', 'rejected') THEN
    UPDATE public.technician_assignments a SET assignment_status = 'removed'
    WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';
  END IF;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (p_booking_id, v_previous, p_new_status, 'status_changed', v_actor,
          coalesce(v_notes, '') || CASE WHEN p_new_status IN ('cancelled', 'rejected') AND v_booking.payment_status = 'paid'
                                        THEN ' (paid booking: issue refund in Stripe)' ELSE '' END);

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_technician(p_booking_id uuid, p_technician_id uuid, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_technician public.technicians;
  v_previous_tech uuid;
  v_previous_status text;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.bookings AS b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.booking_status NOT IN ('confirmed', 'technician_assigned', 'in_progress') THEN
    RAISE EXCEPTION 'booking_not_assignable' USING ERRCODE = '22023';
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
  IF NOT EXISTS (SELECT 1 FROM public.technician_skills s
                 WHERE s.technician_id = p_technician_id AND s.service_id = v_booking.service_id
                   AND (s.task_id IS NULL OR s.task_id = v_booking.task_id)) THEN
    RAISE EXCEPTION 'technician_lacks_skill' USING ERRCODE = '22023';
  END IF;
  IF v_booking.assigned_technician_id = p_technician_id THEN
    RAISE EXCEPTION 'technician_already_assigned' USING ERRCODE = '22023';
  END IF;

  -- No overlapping jobs for the same technician.
  IF EXISTS (
    SELECT 1 FROM public.bookings AS b
    WHERE b.assigned_technician_id = p_technician_id
      AND b.id <> v_booking.id
      AND b.appointment_date = v_booking.appointment_date
      AND b.appointment_start_time < v_booking.appointment_end_time
      AND b.appointment_end_time > v_booking.appointment_start_time
      AND b.booking_status IN ('confirmed', 'technician_assigned', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'technician_already_booked_that_slot' USING ERRCODE = '23505';
  END IF;

  v_previous_tech := v_booking.assigned_technician_id;
  v_previous_status := v_booking.booking_status;

  UPDATE public.technician_assignments AS a
  SET assignment_status = 'reassigned'
  WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';

  INSERT INTO public.technician_assignments (booking_id, technician_id, assigned_by, assignment_status, notes)
  VALUES (v_booking.id, p_technician_id, v_actor, 'assigned', nullif(btrim(coalesce(p_notes, '')), ''));

  UPDATE public.bookings AS b
  SET assigned_technician_id = p_technician_id,
      booking_status = CASE WHEN b.booking_status = 'confirmed' THEN 'technician_assigned' ELSE b.booking_status END
  WHERE b.id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_previous_status, v_booking.booking_status,
          CASE WHEN v_previous_tech IS NULL THEN 'technician_assigned' ELSE 'technician_reassigned' END,
          v_actor, 'Technician: ' || v_technician.full_name || coalesce(' — ' || nullif(btrim(p_notes), ''), ''));

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_technician(p_booking_id uuid, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_previous_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.assigned_technician_id IS NULL THEN
    RAISE EXCEPTION 'no_technician_assigned' USING ERRCODE = '22023';
  END IF;
  IF v_booking.booking_status IN ('completed', 'in_progress') THEN
    RAISE EXCEPTION 'cannot_unassign_now' USING ERRCODE = '22023';
  END IF;
  v_previous_status := v_booking.booking_status;

  UPDATE public.technician_assignments a SET assignment_status = 'removed'
  WHERE a.booking_id = v_booking.id AND a.assignment_status = 'assigned';

  UPDATE public.bookings b
  SET assigned_technician_id = NULL,
      booking_status = CASE WHEN b.booking_status = 'technician_assigned' THEN 'confirmed' ELSE b.booking_status END
  WHERE b.id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_previous_status, v_booking.booking_status, 'technician_removed', (SELECT auth.uid()),
          nullif(btrim(coalesce(p_notes, '')), ''));
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_technician(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_technician(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id uuid, p_date date, p_time time, p_notes text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_slot public.booking_slots;
  v_settings public.business_settings;
  v_old text;
  v_minutes integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_settings FROM public.business_settings WHERE id = true;
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.booking_status IN ('completed', 'cancelled', 'rejected', 'in_progress') THEN
    RAISE EXCEPTION 'booking_not_reschedulable' USING ERRCODE = '22023';
  END IF;
  IF v_booking.appointment_date = p_date AND v_booking.appointment_start_time = p_time THEN
    RAISE EXCEPTION 'same_time' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_bookable_time(p_date, p_time);

  INSERT INTO public.booking_slots (appointment_date, appointment_start_time, capacity)
  VALUES (p_date, p_time, v_settings.slot_capacity)
  ON CONFLICT ON CONSTRAINT booking_slots_unique DO NOTHING;
  SELECT * INTO v_slot FROM public.booking_slots s
  WHERE s.appointment_date = p_date AND s.appointment_start_time = p_time FOR UPDATE;
  IF v_slot.is_blocked THEN
    RAISE EXCEPTION 'slot_blocked' USING ERRCODE = '22023';
  END IF;
  IF public.slot_taken(p_date, p_time, v_booking.id) >= v_slot.capacity THEN
    RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '22023';
  END IF;

  v_minutes := extract(epoch FROM (v_booking.appointment_end_time - v_booking.appointment_start_time))::integer / 60;

  IF v_booking.assigned_technician_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.assigned_technician_id = v_booking.assigned_technician_id AND b.id <> v_booking.id
      AND b.appointment_date = p_date
      AND b.appointment_start_time < public.compute_end_time(p_date, p_time, v_minutes)
      AND b.appointment_end_time > p_time
      AND b.booking_status IN ('confirmed', 'technician_assigned', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'technician_busy_at_new_time' USING ERRCODE = '23505';
  END IF;

  v_old := to_char(v_booking.appointment_date, 'YYYY-MM-DD') || ' ' || to_char(v_booking.appointment_start_time, 'HH24:MI');

  UPDATE public.bookings b
  SET appointment_date = p_date,
      appointment_start_time = p_time,
      appointment_end_time = public.compute_end_time(p_date, p_time, v_minutes)
  WHERE b.id = v_booking.id
  RETURNING * INTO v_booking;

  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_booking.booking_status, v_booking.booking_status, 'rescheduled', (SELECT auth.uid()),
          'From ' || v_old || ' to ' || to_char(p_date, 'YYYY-MM-DD') || ' ' || to_char(p_time, 'HH24:MI')
          || coalesce(' — ' || nullif(btrim(p_notes), ''), ''));
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_booking(uuid, date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, date, time, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_booking_note(p_booking_id uuid, p_note text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_note IS NULL OR char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bookings b
  SET admin_notes = coalesce(b.admin_notes || E'\n', '') || to_char(public.business_now(), 'YYYY-MM-DD HH24:MI') || ' — ' || v_note
  WHERE b.id = p_booking_id
  RETURNING * INTO v_booking;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.booking_status_history (booking_id, previous_status, new_status, action, performed_by, notes)
  VALUES (v_booking.id, v_booking.booking_status, v_booking.booking_status, 'note_added', (SELECT auth.uid()), v_note);
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.add_booking_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_booking_note(uuid, text) TO authenticated;

-- Direct column updates on bookings are no longer needed: every admin change
-- goes through an audited function above.
REVOKE UPDATE ON public.bookings FROM authenticated;
DROP POLICY IF EXISTS bookings_admin_update ON public.bookings;

-- -----------------------------------------------------------------------------
-- 12. Admin analytics
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_days integer := greatest(least(coalesce(p_days, 30), 365), 1);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH paid AS (
    SELECT p.*, (p.amount - p.refunded_amount) AS net
    FROM public.payments p
    WHERE p.payment_status IN ('succeeded', 'partially_refunded', 'refunded')
      AND p.paid_at IS NOT NULL
      AND NOT coalesce((p.transaction_metadata ->> 'amount_mismatch')::boolean, false)
  )
  SELECT jsonb_build_object(
    'period_days', v_days,
    'total_bookings', (SELECT count(*) FROM public.bookings),
    'bookings_in_period', (SELECT count(*) FROM public.bookings WHERE created_at >= v_since),
    'bookings_prev_period', (SELECT count(*) FROM public.bookings WHERE created_at >= v_prev AND created_at < v_since),
    'pending_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status = 'pending_payment'
                          AND public.booking_holds_slot(booking_status, payment_expires_at)),
    'confirmed_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('confirmed', 'technician_assigned')),
    'active_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('confirmed', 'technician_assigned', 'in_progress')),
    'completed_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status = 'completed'),
    'cancelled_bookings', (SELECT count(*) FROM public.bookings WHERE booking_status IN ('cancelled', 'rejected')),
    'failed_payments', (SELECT count(*) FROM public.bookings WHERE booking_status = 'payment_failed'),
    'revenue_in_period', (SELECT coalesce(sum(net), 0) FROM paid WHERE paid_at >= v_since),
    'revenue_prev_period', (SELECT coalesce(sum(net), 0) FROM paid WHERE paid_at >= v_prev AND paid_at < v_since),
    'revenue_total', (SELECT coalesce(sum(net), 0) FROM paid),
    'total_customers', (SELECT count(DISTINCT lower(coalesce(b.guest_email, b.customer_user_id::text))) FROM public.bookings b
                        WHERE b.payment_status IN ('paid', 'refunded', 'partially_refunded')),
    'new_customers_in_period', (
      SELECT count(*) FROM (
        SELECT lower(b.guest_email) e, min(b.created_at) first_at FROM public.bookings b
        WHERE b.payment_status IN ('paid', 'refunded', 'partially_refunded') GROUP BY 1
      ) c WHERE c.first_at >= v_since),
    'available_technicians', (SELECT count(*) FROM public.technicians WHERE active_status AND availability_status = 'available'),
    'total_technicians', (SELECT count(*) FROM public.technicians WHERE active_status),
    'average_rating', (SELECT round(avg(r.rating)::numeric, 2) FROM public.reviews r WHERE r.visibility_status = 'published'),
    'review_count', (SELECT count(*) FROM public.reviews r WHERE r.visibility_status = 'published'),
    'popular_services', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'bookings', x.bookings, 'revenue', x.revenue)
                                ORDER BY x.bookings DESC, x.name), '[]'::jsonb)
      FROM (
        SELECT s.name, count(b.id) AS bookings,
               coalesce(sum(b.total_amount) FILTER (WHERE b.payment_status = 'paid'), 0) AS revenue
        FROM public.services s
        LEFT JOIN public.bookings b ON b.service_id = s.id AND b.created_at >= v_since
             AND b.booking_status NOT IN ('payment_failed')
        GROUP BY s.name
      ) x),
    'monthly_revenue', (
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'month_start', m,
                                          'value', coalesce((SELECT sum(net) FROM paid WHERE date_trunc('month', paid_at) = m), 0))
                       ORDER BY m)
      FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m),
    'daily_bookings', (
      SELECT jsonb_agg(jsonb_build_object('day', d::date,
                                          'count', (SELECT count(*) FROM public.bookings b WHERE b.created_at::date = d::date)) ORDER BY d)
      FROM generate_series(date_trunc('day', now()) - make_interval(days => least(v_days, 60) - 1), date_trunc('day', now()), interval '1 day') d),
    'customer_growth', (
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'),
               'value', (SELECT count(*) FROM (
                          SELECT lower(b.guest_email) e, min(b.created_at) first_at FROM public.bookings b
                          WHERE b.payment_status IN ('paid', 'refunded', 'partially_refunded') GROUP BY 1) c
                         WHERE date_trunc('month', c.first_at) = m)) ORDER BY m)
      FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m),
    'technician_performance', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.full_name,
               'completed', (SELECT count(*) FROM public.bookings b WHERE b.assigned_technician_id = t.id AND b.booking_status = 'completed'),
               'active', (SELECT count(*) FROM public.bookings b WHERE b.assigned_technician_id = t.id
                          AND b.booking_status IN ('technician_assigned', 'in_progress')),
               'rating', (SELECT round(avg(r.rating)::numeric, 2) FROM public.reviews r WHERE r.technician_id = t.id AND r.visibility_status = 'published')
             ) ORDER BY t.full_name), '[]'::jsonb)
      FROM public.technicians t WHERE t.active_status)
  ) INTO v_result
  ;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_customers(p_search text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH c AS (
    SELECT lower(b.guest_email) AS email,
           (array_agg(b.guest_name ORDER BY b.created_at DESC))[1] AS name,
           (array_agg(b.guest_phone ORDER BY b.created_at DESC))[1] AS phone,
           (array_agg(b.city ORDER BY b.created_at DESC))[1] AS city,
           count(*) AS bookings,
           count(*) FILTER (WHERE b.payment_status IN ('paid', 'refunded', 'partially_refunded')) AS paid_bookings,
           count(*) FILTER (WHERE b.booking_status = 'completed') AS completed_bookings,
           coalesce(sum(b.total_amount) FILTER (WHERE b.payment_status = 'paid'), 0) AS spent,
           min(b.created_at) AS first_booking_at,
           max(b.created_at) AS last_booking_at,
           bool_or(b.customer_user_id IS NOT NULL) AS has_account
    FROM public.bookings b
    WHERE b.guest_email IS NOT NULL
    GROUP BY lower(b.guest_email)
  ), f AS (
    SELECT c.*, p.account_status
    FROM c LEFT JOIN public.profiles p ON lower(p.email) = c.email
    WHERE v_q IS NULL OR c.email ILIKE '%' || v_q || '%' OR c.name ILIKE '%' || v_q || '%' OR c.phone ILIKE '%' || v_q || '%'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.last_booking_at DESC)
                      FROM (SELECT * FROM f ORDER BY last_booking_at DESC LIMIT greatest(1, least(p_limit, 200)) OFFSET greatest(p_offset, 0)) x),
                     '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_customers(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_customers(text, integer, integer) TO authenticated;

-- Keep technicians.average_rating in sync with published reviews.
CREATE OR REPLACE FUNCTION public.refresh_technician_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tech uuid := coalesce(NEW.technician_id, OLD.technician_id);
BEGIN
  IF v_tech IS NOT NULL THEN
    UPDATE public.technicians t
    SET average_rating = coalesce((SELECT round(avg(r.rating)::numeric, 2) FROM public.reviews r
                                   WHERE r.technician_id = v_tech AND r.visibility_status = 'published'), 0)
    WHERE t.id = v_tech;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON public.reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OF visibility_status, rating OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_technician_rating();

-- -----------------------------------------------------------------------------
-- 13. Contact messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON public.contact_messages (status, created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM anon, authenticated;
GRANT SELECT, UPDATE (status) ON public.contact_messages TO authenticated;
CREATE POLICY contact_messages_admin_read ON public.contact_messages
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY contact_messages_admin_update ON public.contact_messages
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.submit_contact_message(p_name text, p_email text, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NULL OR char_length(v_message) NOT BETWEEN 5 AND 5000 THEN
    RAISE EXCEPTION 'invalid_message' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.contact_messages m WHERE m.email = v_email AND m.created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too_many_messages' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contact_messages (name, email, message) VALUES (v_name, v_email, v_message);
  PERFORM public.enqueue_email(NULL, 'admin_contact_message', 'admin',
    jsonb_build_object('name', v_name, 'email', v_email, 'message', left(v_message, 2000)));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contact_message(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 14. Access-control tightening
-- -----------------------------------------------------------------------------
-- Technician contact details are internal: admin only.
DROP POLICY IF EXISTS technicians_public_read ON public.technicians;
CREATE POLICY technicians_admin_read ON public.technicians
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.technicians FROM anon;

DROP POLICY IF EXISTS technician_skills_public_read ON public.technician_skills;
CREATE POLICY technician_skills_admin_read ON public.technician_skills
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.technician_skills FROM anon;

-- Reviews: only admins moderate (customers cannot self-publish).
DROP POLICY IF EXISTS reviews_admin_update ON public.reviews;
CREATE POLICY reviews_admin_update ON public.reviews
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE UPDATE ON public.reviews FROM authenticated;
GRANT UPDATE (visibility_status) ON public.reviews TO authenticated;
DROP POLICY IF EXISTS reviews_public_read ON public.reviews;
CREATE POLICY reviews_public_read ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (visibility_status = 'published' OR public.is_admin());
REVOKE ALL ON public.reviews FROM anon;
GRANT SELECT (id, service_id, rating, review_text, visibility_status, created_at) ON public.reviews TO anon;

-- Admin can read booking attachments metadata (already) and notifications.
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (user_id IS NULL AND public.is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (user_id IS NULL AND public.is_admin()));
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_status) ON public.notifications TO authenticated;

-- business_settings: restrict which columns the admin can edit from the app.
REVOKE UPDATE ON public.business_settings FROM authenticated;
GRANT UPDATE (business_name, logo_url, contact_email, contact_phone, default_booking_fee, business_hours_start,
              business_hours_end, working_days, cancellation_policy, booking_rules, default_service_duration_minutes,
              slot_capacity, max_advance_days, min_lead_hours, notify_customer_email, notify_admin_email, timezone,
              payment_hold_minutes)
  ON public.business_settings TO authenticated;

-- Payments are written only by trusted functions; admins read them.
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;

-- Trigger/internal helpers should not be callable through the RPC API.
REVOKE ALL ON FUNCTION public.fixora_handle_payment_webhook() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fixora_history_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_technician_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.history_is_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 15. Storage policies
-- -----------------------------------------------------------------------------
-- booking-attachments (private): written only by the upload edge function
-- (API key bypasses RLS); readable/removable by the admin.
-- public-media (public): service and technician images managed by the admin.
DROP POLICY IF EXISTS storage_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_delete ON storage.objects;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixora_admin_all_objects ON storage.objects
  FOR ALL TO authenticated
  USING (bucket IN ('booking-attachments', 'public-media') AND public.is_admin())
  WITH CHECK (bucket IN ('booking-attachments', 'public-media') AND public.is_admin());

CREATE POLICY fixora_public_media_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket = 'public-media');
