-- Catalogue/technician records are deactivated, never deleted, so booking
-- history (and its snapshots) is always preserved.
REVOKE DELETE ON public.services, public.service_tasks, public.technicians FROM authenticated;

-- Assignments are written only by assign_technician / unassign_technician /
-- set_booking_status (audited, conflict-checked).
REVOKE INSERT, UPDATE, DELETE ON public.technician_assignments FROM authenticated;

-- Admin task-price editing: "price" shown to customers = starting + additional.
-- When a service starting price changes, keep every task's customer price.
CREATE OR REPLACE FUNCTION public.admin_update_service_pricing(p_service_id uuid, p_starting_price numeric, p_booking_fee numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old numeric(10, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_starting_price IS NULL OR p_starting_price < 0 OR p_starting_price > 100000 THEN
    RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
  END IF;
  IF p_booking_fee IS NOT NULL AND (p_booking_fee < 0 OR p_booking_fee > 10000) THEN
    RAISE EXCEPTION 'invalid_fee' USING ERRCODE = '22023';
  END IF;
  SELECT starting_price INTO v_old FROM public.services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.service_tasks t SET additional_price = t.additional_price + (v_old - p_starting_price)
  WHERE t.service_id = p_service_id;
  IF EXISTS (SELECT 1 FROM public.service_tasks t WHERE t.service_id = p_service_id AND t.additional_price < 0) THEN
    RAISE EXCEPTION 'starting_price_above_task_price' USING ERRCODE = '22023';
  END IF;
  UPDATE public.services SET starting_price = p_starting_price, booking_fee = p_booking_fee WHERE id = p_service_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_service_pricing(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_service_pricing(uuid, numeric, numeric) TO authenticated;

-- Signed URL generation for private attachments is done with the admin's
-- session; expose a safe listing for the booking detail page.
CREATE OR REPLACE FUNCTION public.admin_booking_detail(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'booking', to_jsonb(b) - 'lookup_token_hash' - 'lookup_token_cipher' - 'idempotency_key',
    'technician', (SELECT jsonb_build_object('id', t.id, 'full_name', t.full_name, 'phone', t.phone) FROM public.technicians t WHERE t.id = b.assigned_technician_id),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'previous_status', h.previous_status, 'new_status', h.new_status,
                  'action', h.action, 'notes', h.notes, 'created_at', h.created_at,
                  'performed_by', (SELECT u.email FROM auth.users u WHERE u.id = h.performed_by)) ORDER BY h.created_at DESC)
                 FROM public.booking_status_history h WHERE h.booking_id = b.id), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM public.payments p WHERE p.booking_id = b.id), '[]'::jsonb),
    'attachments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path, 'original_file_name', a.original_file_name,
                  'file_type', a.file_type, 'file_size', a.file_size, 'created_at', a.created_at) ORDER BY a.created_at)
                 FROM public.booking_attachments a WHERE a.booking_id = b.id), '[]'::jsonb),
    'emails', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'email_type', e.email_type, 'recipient_email', e.recipient_email,
                  'delivery_status', e.delivery_status, 'error_message', e.error_message, 'attempts', e.attempts, 'created_at', e.created_at, 'sent_at', e.sent_at)
                  ORDER BY e.created_at DESC) FROM public.email_logs e WHERE e.booking_id = b.id), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object('technician', t.full_name, 'status', a.assignment_status, 'assigned_at', a.created_at, 'notes', a.notes)
                  ORDER BY a.created_at DESC) FROM public.technician_assignments a JOIN public.technicians t ON t.id = a.technician_id WHERE a.booking_id = b.id), '[]'::jsonb),
    'review', (SELECT to_jsonb(r) FROM public.reviews r WHERE r.booking_id = b.id),
    'eligible_technicians', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'full_name', t.full_name, 'availability_status', t.availability_status,
        'has_skill', EXISTS (SELECT 1 FROM public.technician_skills s WHERE s.technician_id = t.id AND s.service_id = b.service_id AND (s.task_id IS NULL OR s.task_id = b.task_id)),
        'conflict', EXISTS (SELECT 1 FROM public.bookings o WHERE o.assigned_technician_id = t.id AND o.id <> b.id AND o.appointment_date = b.appointment_date
                            AND o.appointment_start_time < b.appointment_end_time AND o.appointment_end_time > b.appointment_start_time
                            AND o.booking_status IN ('confirmed', 'technician_assigned', 'in_progress'))
      ) ORDER BY t.full_name)
      FROM public.technicians t WHERE t.active_status), '[]'::jsonb)
  ) INTO v
  FROM public.bookings b WHERE b.id = p_booking_id;
  IF v IS NULL THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_booking_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_booking_detail(uuid) TO authenticated;

-- Round Stripe minor units to two decimals.
CREATE OR REPLACE FUNCTION public.stripe_amount(p_minor text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$ SELECT round(coalesce(p_minor, '0')::numeric / 100, 2) $$;

CREATE OR REPLACE FUNCTION public.apply_stripe_event(
  p_event_id text, p_event_type text, p_environment text, p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_obj jsonb := p_payload -> 'data' -> 'object';
  v_booking_id uuid;
  v_outcome text;
  v_inserted integer;
BEGIN
  IF p_event_type NOT IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded',
                          'checkout.session.async_payment_failed', 'checkout.session.expired', 'charge.refunded') THEN
    RETURN 'ignored_event_type';
  END IF;

  BEGIN
    v_booking_id := nullif(v_obj -> 'metadata' ->> 'booking_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_booking_id := NULL;
  END;

  IF p_event_type <> 'charge.refunded' AND v_booking_id IS NULL THEN
    RETURN 'not_fixora';
  END IF;
  IF v_booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = v_booking_id) THEN
    v_booking_id := NULL;
    IF p_event_type <> 'charge.refunded' THEN
      RETURN 'unknown_booking';
    END IF;
  END IF;

  INSERT INTO public.payment_event_log (provider, provider_event_id, event_type, booking_id)
  VALUES ('stripe', p_event_id, p_event_type, v_booking_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN 'duplicate_event';
  END IF;

  BEGIN
    IF p_event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') THEN
      IF v_obj ->> 'payment_status' = 'paid' THEN
        v_outcome := public.record_payment_success(
          v_booking_id, 'stripe', v_obj ->> 'payment_intent', v_obj ->> 'id',
          public.stripe_amount(v_obj ->> 'amount_total'), coalesce(v_obj ->> 'currency', 'usd'),
          coalesce(v_obj -> 'payment_method_types' ->> 0, 'card'),
          jsonb_build_object('environment', p_environment, 'event_id', p_event_id,
                             'customer_email', v_obj -> 'customer_details' ->> 'email'));
      ELSE
        UPDATE public.payments p SET payment_status = 'pending'
        WHERE p.provider = 'stripe' AND p.checkout_session_id = v_obj ->> 'id';
        UPDATE public.bookings b SET payment_status = 'pending'
        WHERE b.id = v_booking_id AND b.payment_status IN ('unpaid', 'failed');
        v_outcome := 'awaiting_async_payment';
      END IF;
    ELSIF p_event_type = 'checkout.session.async_payment_failed' THEN
      v_outcome := public.record_payment_failure(v_booking_id, 'stripe', v_obj ->> 'id', 'failed', 'Asynchronous payment failed');
    ELSIF p_event_type = 'checkout.session.expired' THEN
      v_outcome := public.record_payment_failure(v_booking_id, 'stripe', v_obj ->> 'id', 'cancelled', 'Checkout session expired');
    ELSIF p_event_type = 'charge.refunded' THEN
      v_outcome := public.record_refund('stripe', v_obj ->> 'payment_intent',
                                        public.stripe_amount(v_obj ->> 'amount_refunded'), coalesce(v_obj ->> 'currency', 'usd'));
    END IF;

    UPDATE public.payment_event_log l SET outcome = v_outcome
    WHERE l.provider = 'stripe' AND l.provider_event_id = p_event_id;
  EXCEPTION WHEN others THEN
    v_outcome := 'error';
    UPDATE public.payment_event_log l SET outcome = 'error', error_message = SQLERRM
    WHERE l.provider = 'stripe' AND l.provider_event_id = p_event_id;
    PERFORM public.enqueue_admin_alert(v_booking_id, 'booking_problem',
      'Payment webhook ' || p_event_type || ' failed to apply: ' || SQLERRM);
  END;

  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_event(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
