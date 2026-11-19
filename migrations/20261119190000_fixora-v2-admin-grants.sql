-- Admin moderation/settings writes. RLS policies already restrict these to is_admin();
-- grants are column-scoped so even the admin path cannot rewrite ids/foreign keys.
grant update (visibility_status) on public.reviews to authenticated;
grant update (status) on public.contact_messages to authenticated;
grant update (
  business_name, contact_email, contact_phone, default_booking_fee, business_hours_start,
  business_hours_end, working_days, cancellation_policy, booking_rules, slot_capacity,
  max_advance_days, min_lead_hours, notify_customer_email, notify_admin_email,
  payment_hold_minutes, timezone
) on public.business_settings to authenticated;
-- Only one settings row exists; admins must not insert/delete it.
revoke insert, delete on public.business_settings from authenticated;
