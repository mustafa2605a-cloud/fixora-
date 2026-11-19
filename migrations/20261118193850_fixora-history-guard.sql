-- Booking history must never be edited in place. DELETE is left to cascade so a
-- booking can still be removed during maintenance, but runtime roles have no
-- DELETE privilege and cannot reach this path.

CREATE OR REPLACE FUNCTION public.history_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'booking history is append only' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
