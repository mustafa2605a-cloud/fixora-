-- Fix: technician_assignments.assigned_at and booking_attachments.uploaded_at (no created_at columns).
CREATE OR REPLACE FUNCTION public.admin_booking_detail(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
                  'file_type', a.file_type, 'file_size', a.file_size, 'created_at', a.uploaded_at) ORDER BY a.uploaded_at)
                 FROM public.booking_attachments a WHERE a.booking_id = b.id), '[]'::jsonb),
    'emails', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'email_type', e.email_type, 'recipient_email', e.recipient_email,
                  'delivery_status', e.delivery_status, 'error_message', e.error_message, 'attempts', e.attempts, 'created_at', e.created_at, 'sent_at', e.sent_at)
                  ORDER BY e.created_at DESC) FROM public.email_logs e WHERE e.booking_id = b.id), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object('technician', t.full_name, 'status', a.assignment_status, 'assigned_at', a.assigned_at, 'notes', a.notes)
                  ORDER BY a.assigned_at DESC) FROM public.technician_assignments a JOIN public.technicians t ON t.id = a.technician_id WHERE a.booking_id = b.id), '[]'::jsonb),
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
$function$;
