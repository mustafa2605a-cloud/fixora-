-- Split Stripe event handling out of the trigger so the exact same code path
-- can be exercised by trusted tooling (tests / manual replays by an operator)
-- without write access to payments.webhook_events.

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
          ((v_obj ->> 'amount_total')::numeric / 100), coalesce(v_obj ->> 'currency', 'usd'),
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
                                        ((v_obj ->> 'amount_refunded')::numeric / 100), coalesce(v_obj ->> 'currency', 'usd'));
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

CREATE OR REPLACE FUNCTION public.fixora_handle_payment_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Only events that InsForge has signature-verified and processed.
  IF NEW.provider = 'stripe' AND NEW.processing_status = 'processed' THEN
    PERFORM public.apply_stripe_event(NEW.provider_event_id, NEW.event_type, NEW.environment, NEW.payload);
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Never break InsForge's own webhook bookkeeping.
  RAISE WARNING 'fixora webhook handler failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fixora_handle_payment_webhook() FROM PUBLIC, anon, authenticated;
