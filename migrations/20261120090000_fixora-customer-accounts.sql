-- Fixora customer accounts (optional sign-in; guest checkout unchanged).
--  * Bookings made while signed in are owned by the account (create_booking already stores auth.uid()).
--  * Guest bookings made with the same, VERIFIED email are linked to the account (link_my_bookings).
--  * Owners can open / pay / cancel / review their own bookings without the private link token.
--  * Signed-in bookings remember name, phone and address for next time.

-- 1. Booking access: private token OR the signed-in owner ------------------------------------
DROP FUNCTION IF EXISTS public.find_booking_by_token(text, text);

CREATE OR REPLACE FUNCTION public.find_booking_by_token(p_reference text, p_token text, p_owner uuid DEFAULT NULL)
 RETURNS public.bookings
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking public.bookings;
  -- p_owner is only passed by trusted server code (this function is not executable by clients);
  -- otherwise the caller's own verified session decides ownership.
  v_owner uuid := coalesce(p_owner, (SELECT auth.uid()));
  v_ref text := upper(btrim(coalesce(p_reference, '')));
BEGIN
  IF v_ref = '' THEN
    RAISE EXCEPTION 'invalid_lookup' USING ERRCODE = '22023';
  END IF;

  IF p_token IS NOT NULL AND char_length(p_token) >= 32 THEN
    SELECT * INTO v_booking FROM public.bookings AS b
    WHERE b.booking_reference = v_ref
      AND b.lookup_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
    IF FOUND THEN
      RETURN v_booking;
    END IF;
  END IF;

  IF v_owner IS NOT NULL THEN
    SELECT * INTO v_booking FROM public.bookings AS b
    WHERE b.booking_reference = v_ref AND b.customer_user_id = v_owner;
    IF FOUND THEN
      RETURN v_booking;
    END IF;
  END IF;

  IF (p_token IS NULL OR char_length(p_token) < 32) AND v_owner IS NULL THEN
    RAISE EXCEPTION 'invalid_lookup' USING ERRCODE = '22023';
  END IF;
  RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
END;
$function$;

REVOKE ALL ON FUNCTION public.find_booking_by_token(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_booking_by_token(text, text, uuid) TO project_admin;

-- 2. Checkout preparation (server only) can act for a verified owner --------------------------
DROP FUNCTION IF EXISTS public.prepare_checkout(text, text);

CREATE OR REPLACE FUNCTION public.prepare_checkout(p_reference text, p_token text, p_owner uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking public.bookings;
  v_open jsonb;
BEGIN
  v_booking := public.find_booking_by_token(p_reference, p_token, p_owner);
  IF v_booking.payment_status = 'paid' THEN
    RAISE EXCEPTION 'already_paid' USING ERRCODE = '22023';
  END IF;
  IF v_booking.booking_status <> 'pending_payment' THEN
    RAISE EXCEPTION 'booking_not_payable' USING ERRCODE = '22023';
  END IF;
  IF NOT public.booking_holds_slot(v_booking.booking_status, v_booking.payment_expires_at) THEN
    RAISE EXCEPTION 'payment_window_expired' USING ERRCODE = '22023';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.prepare_checkout(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(text, text, uuid) TO project_admin;

-- 3. Remember a signed-in customer's details (internal helper) --------------------------------
CREATE OR REPLACE FUNCTION public.remember_customer_details(
  p_uid uuid, p_name text, p_phone text, p_city text, p_area text,
  p_street text, p_building text, p_apartment text, p_directions text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_street text := nullif(btrim(coalesce(p_street, '')), '');
  v_apartment text := nullif(btrim(coalesce(p_apartment, '')), '');
BEGIN
  IF p_uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.profiles AS p (id, full_name, email, phone, role)
  SELECT p_uid, nullif(btrim(coalesce(p_name, '')), ''), u.email, nullif(btrim(coalesce(p_phone, '')), ''),
         CASE WHEN public.is_admin() THEN 'admin' ELSE 'customer' END
  FROM auth.users AS u WHERE u.id = p_uid
  ON CONFLICT (id) DO UPDATE
    SET full_name = coalesce(p.full_name, EXCLUDED.full_name),
        phone = coalesce(p.phone, EXCLUDED.phone);

  IF v_street IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.addresses a
       WHERE a.customer_user_id = p_uid
         AND lower(a.city) = lower(p_city) AND lower(a.area) = lower(p_area)
         AND lower(coalesce(a.street, '')) = lower(v_street)
         AND lower(coalesce(a.apartment_number, '')) = lower(coalesce(v_apartment, ''))
     )
     AND (SELECT count(*) FROM public.addresses a WHERE a.customer_user_id = p_uid) < 10 THEN
    INSERT INTO public.addresses (customer_user_id, address_label, city, area, street, building_number,
                                  apartment_number, additional_directions, is_default)
    VALUES (p_uid, NULL, p_city, p_area, v_street, nullif(btrim(coalesce(p_building, '')), ''), v_apartment,
            nullif(btrim(coalesce(p_directions, '')), ''),
            NOT EXISTS (SELECT 1 FROM public.addresses a WHERE a.customer_user_id = p_uid AND a.is_default));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.remember_customer_details(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remember_customer_details(uuid, text, text, text, text, text, text, text, text) TO project_admin;

-- 4. Link guest bookings made with the account's VERIFIED email -------------------------------
CREATE OR REPLACE FUNCTION public.link_my_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u
  WHERE u.id = v_uid AND coalesce(u.email_verified, false) AND u.email IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN 0;  -- unverified emails never claim bookings
  END IF;

  WITH linked AS (
    UPDATE public.bookings b SET customer_user_id = v_uid
    WHERE b.customer_user_id IS NULL AND lower(b.guest_email) = v_email
    RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM linked;

  IF v_count > 0 THEN
    UPDATE public.payments p SET customer_user_id = v_uid
    FROM public.bookings b
    WHERE p.booking_id = b.id AND b.customer_user_id = v_uid AND p.customer_user_id IS NULL;
    UPDATE public.reviews r SET customer_user_id = v_uid
    FROM public.bookings b
    WHERE r.booking_id = b.id AND b.customer_user_id = v_uid AND r.customer_user_id IS NULL;
  END IF;
  RETURN v_count;
END;
$function$;

-- 5. Lightweight "who am I" for the site header ------------------------------------------------
CREATE OR REPLACE FUNCTION public.whoami()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'email', u.email,
    'name', coalesce(p.full_name, nullif(u.profile ->> 'name', '')),
    'is_admin', public.is_admin()
  ) END
  FROM (SELECT 1) AS one
  LEFT JOIN auth.users u ON u.id = (SELECT auth.uid())
  LEFT JOIN public.profiles p ON p.id = u.id;
$function$;

-- 6. Account overview: profile + saved addresses + own bookings --------------------------------
CREATE OR REPLACE FUNCTION public.my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_user auth.users;
  v_profile public.profiles;
  v_linked integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_user FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.profiles AS p (id, full_name, email, role)
  VALUES (v_uid, nullif(btrim(coalesce(v_user.profile ->> 'name', '')), ''), v_user.email,
          CASE WHEN public.is_admin() THEN 'admin' ELSE 'customer' END)
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = v_uid;

  v_linked := public.link_my_bookings();

  RETURN jsonb_build_object(
    'email', v_user.email,
    'email_verified', coalesce(v_user.email_verified, false),
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'member_since', v_profile.created_at,
    'linked_now', v_linked,
    'addresses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'label', a.address_label, 'city', a.city, 'area', a.area, 'street', a.street,
        'building', a.building_number, 'apartment', a.apartment_number, 'directions', a.additional_directions,
        'is_default', a.is_default) ORDER BY a.is_default DESC, a.created_at DESC)
      FROM public.addresses a WHERE a.customer_user_id = v_uid), '[]'::jsonb),
    'bookings', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'reference', b.booking_reference,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'service_name', b.service_name_snapshot,
        'task_name', b.task_name_snapshot,
        'appointment_date', b.appointment_date,
        'appointment_start_time', b.appointment_start_time,
        'appointment_end_time', b.appointment_end_time,
        'total_amount', b.total_amount,
        'currency', b.currency,
        'city', b.city,
        'area', b.area,
        'technician', (SELECT t.full_name FROM public.technicians t WHERE t.id = b.assigned_technician_id),
        'can_pay', b.booking_status = 'pending_payment' AND b.payment_status IN ('unpaid', 'pending', 'failed')
                   AND public.booking_holds_slot(b.booking_status, b.payment_expires_at),
        'can_review', b.booking_status = 'completed' AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id),
        'created_at', b.created_at
      ) ORDER BY b.appointment_date DESC, b.appointment_start_time DESC, b.created_at DESC)
      FROM (SELECT * FROM public.bookings b0 WHERE b0.customer_user_id = v_uid
            ORDER BY b0.appointment_date DESC, b0.created_at DESC LIMIT 200) b), '[]'::jsonb)
  );
END;
$function$;

-- 7. Profile + address management (own rows only) ---------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_profile(p_full_name text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND (char_length(v_phone) > 40 OR char_length(regexp_replace(v_phone, '\D', '', 'g')) NOT BETWEEN 6 AND 15) THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles AS p (id, full_name, email, phone, role)
  SELECT v_uid, v_name, u.email, v_phone, CASE WHEN public.is_admin() THEN 'admin' ELSE 'customer' END
  FROM auth.users u WHERE u.id = v_uid
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;

  RETURN jsonb_build_object('full_name', v_name, 'phone', v_phone);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_address(
  p_id uuid, p_label text, p_city text, p_area text, p_street text,
  p_building text, p_apartment text, p_directions text, p_make_default boolean DEFAULT false
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_street text := nullif(btrim(coalesce(p_street, '')), '');
  v_id uuid := p_id;
  v_first boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_street IS NULL OR char_length(v_street) < 5 OR char_length(v_street) > 300 THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_label, '')) > 40 OR char_length(coalesce(p_building, '')) > 100
     OR char_length(coalesce(p_apartment, '')) > 50 OR char_length(coalesce(p_directions, '')) > 500 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_areas a
    WHERE a.active_status AND lower(a.city) = lower(btrim(coalesce(p_city, ''))) AND lower(a.area_name) = lower(btrim(coalesce(p_area, '')))
  ) THEN
    RAISE EXCEPTION 'area_not_served' USING ERRCODE = '22023';
  END IF;

  v_first := NOT EXISTS (SELECT 1 FROM public.addresses a WHERE a.customer_user_id = v_uid AND a.is_default AND a.id IS DISTINCT FROM p_id);
  IF coalesce(p_make_default, false) OR v_first THEN
    UPDATE public.addresses SET is_default = false WHERE customer_user_id = v_uid AND is_default AND id IS DISTINCT FROM p_id;
  END IF;

  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM public.addresses a WHERE a.customer_user_id = v_uid) >= 10 THEN
      RAISE EXCEPTION 'too_many_addresses' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.addresses (customer_user_id, address_label, city, area, street, building_number,
                                  apartment_number, additional_directions, is_default)
    VALUES (v_uid, nullif(btrim(coalesce(p_label, '')), ''), btrim(p_city), btrim(p_area), v_street,
            nullif(btrim(coalesce(p_building, '')), ''), nullif(btrim(coalesce(p_apartment, '')), ''),
            nullif(btrim(coalesce(p_directions, '')), ''), coalesce(p_make_default, false) OR v_first)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.addresses AS a
    SET address_label = nullif(btrim(coalesce(p_label, '')), ''), city = btrim(p_city), area = btrim(p_area),
        street = v_street, building_number = nullif(btrim(coalesce(p_building, '')), ''),
        apartment_number = nullif(btrim(coalesce(p_apartment, '')), ''),
        additional_directions = nullif(btrim(coalesce(p_directions, '')), ''),
        is_default = a.is_default OR coalesce(p_make_default, false) OR v_first
    WHERE a.id = p_id AND a.customer_user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'address_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_address(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_was_default boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM public.addresses a WHERE a.id = p_id AND a.customer_user_id = v_uid RETURNING a.is_default INTO v_was_default;
  IF v_was_default THEN
    UPDATE public.addresses SET is_default = true
    WHERE id = (SELECT a.id FROM public.addresses a WHERE a.customer_user_id = v_uid ORDER BY a.created_at DESC LIMIT 1);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_my_bookings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.whoami() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_address(uuid, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_bookings() TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.whoami() TO anon, authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.my_account() TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.save_my_address(uuid, text, text, text, text, text, text, text, boolean) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.delete_my_address(uuid) TO authenticated, project_admin;

-- 8. create_booking: remember signed-in customers' details (never blocks the booking) ----------
CREATE OR REPLACE FUNCTION public.create_booking(p_service_id uuid, p_task_id uuid, p_full_name text, p_email text, p_phone text, p_problem_description text, p_service_address text, p_city text, p_area text, p_street text DEFAULT NULL::text, p_building_number text DEFAULT NULL::text, p_apartment_number text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_additional_directions text DEFAULT NULL::text, p_appointment_date date DEFAULT NULL::date, p_appointment_start_time time without time zone DEFAULT NULL::time without time zone, p_customer_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(booking_id uuid, booking_reference text, booking_status text, payment_status text, total_amount numeric, currency text, appointment_date date, appointment_start_time time without time zone, lookup_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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

  -- Signed-in customers: remember name, phone and address for next time.
  -- Best effort only: a failure here must never block the booking.
  IF v_uid IS NOT NULL THEN
    BEGIN
      PERFORM public.remember_customer_details(v_uid, v_name, v_phone, v_city, v_area, v_address,
                                               p_building_number, p_apartment_number, p_additional_directions);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'remember_customer_details failed: %', SQLERRM;
    END;
  END IF;

  RETURN QUERY SELECT
    v_booking.id, v_booking.booking_reference, v_booking.booking_status, v_booking.payment_status,
    v_booking.total_amount, v_booking.currency, v_booking.appointment_date,
    v_booking.appointment_start_time, v_token;
END;
$function$;
