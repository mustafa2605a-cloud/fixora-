-- Booking-form prefill for signed-in customers (read-only, own data only).
CREATE OR REPLACE FUNCTION public.my_prefill()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'email', u.email,
    'full_name', coalesce(p.full_name, nullif(u.profile ->> 'name', '')),
    'phone', p.phone,
    'addresses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'label', a.address_label, 'city', a.city, 'area', a.area, 'street', a.street,
        'building', a.building_number, 'apartment', a.apartment_number, 'directions', a.additional_directions,
        'is_default', a.is_default) ORDER BY a.is_default DESC, a.created_at DESC)
      FROM public.addresses a WHERE a.customer_user_id = u.id), '[]'::jsonb)
  ) END
  FROM (SELECT 1) AS one
  LEFT JOIN auth.users u ON u.id = (SELECT auth.uid())
  LEFT JOIN public.profiles p ON p.id = u.id;
$function$;

REVOKE ALL ON FUNCTION public.my_prefill() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_prefill() TO authenticated, project_admin;
