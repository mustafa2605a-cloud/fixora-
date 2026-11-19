CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.app_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  admin_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_config (id) VALUES (true);

CREATE TABLE public.business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  business_name text NOT NULL DEFAULT 'Fixora',
  logo_url text,
  contact_email text,
  contact_phone text,
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  default_booking_fee numeric(10, 2) NOT NULL DEFAULT 5 CHECK (default_booking_fee >= 0),
  business_hours_start time NOT NULL DEFAULT '08:00',
  business_hours_end time NOT NULL DEFAULT '20:00',
  working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  cancellation_policy text,
  booking_rules text,
  default_service_duration_minutes integer NOT NULL DEFAULT 60 CHECK (default_service_duration_minutes > 0),
  slot_capacity integer NOT NULL DEFAULT 3 CHECK (slot_capacity > 0),
  max_advance_days integer NOT NULL DEFAULT 30 CHECK (max_advance_days > 0),
  min_lead_hours integer NOT NULL DEFAULT 2 CHECK (min_lead_hours >= 0),
  notify_customer_email boolean NOT NULL DEFAULT true,
  notify_admin_email boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_settings_hours_check CHECK (business_hours_end > business_hours_start)
);

INSERT INTO public.business_settings (id) VALUES (true);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  profile_image text,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_email_lower_key ON public.profiles (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX profiles_role_idx ON public.profiles (role);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image text,
  starting_price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (starting_price >= 0),
  booking_fee numeric(10, 2) CHECK (booking_fee IS NULL OR booking_fee >= 0),
  estimated_duration text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  active_status boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX services_active_order_idx ON public.services (active_status, display_order);

CREATE TABLE public.service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  additional_price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (additional_price >= 0),
  estimated_duration text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  active_status boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_tasks_unique_name UNIQUE (service_id, name)
);

CREATE INDEX service_tasks_service_idx ON public.service_tasks (service_id, active_status, display_order);

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_name text NOT NULL,
  city text NOT NULL,
  postal_code text,
  active_status boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_areas_unique UNIQUE (city, area_name)
);

CREATE INDEX service_areas_lookup_idx ON public.service_areas (active_status, lower(city), lower(area_name));

CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text NOT NULL,
  profile_image text,
  description text,
  active_status boolean NOT NULL DEFAULT true,
  availability_status text NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'on_job', 'off_duty', 'unavailable')),
  average_rating numeric(3, 2) NOT NULL DEFAULT 0 CHECK (average_rating >= 0 AND average_rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX technicians_active_idx ON public.technicians (active_status, availability_status);

CREATE TABLE public.technician_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.service_tasks (id) ON DELETE CASCADE,
  skill_description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX technician_skills_unique
  ON public.technician_skills (technician_id, service_id, coalesce(task_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX technician_skills_service_idx ON public.technician_skills (service_id);

CREATE TABLE public.booking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_date date NOT NULL,
  appointment_start_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_slots_unique UNIQUE (appointment_date, appointment_start_time)
);

CREATE SEQUENCE public.booking_reference_seq START WITH 10501 INCREMENT BY 1;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text NOT NULL UNIQUE,
  idempotency_key text UNIQUE,
  lookup_token_hash text NOT NULL,
  customer_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  
  guest_name text,
  guest_email text,
  guest_phone text,

  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  service_name_snapshot text NOT NULL,
  task_id uuid REFERENCES public.service_tasks (id) ON DELETE SET NULL,
  task_name_snapshot text,
  problem_description text,

  service_address text NOT NULL,
  city text NOT NULL,
  area text NOT NULL,
  street text,
  building_number text,
  apartment_number text,
  postal_code text,
  additional_directions text,

  appointment_date date NOT NULL,
  appointment_start_time time NOT NULL,
  appointment_end_time time NOT NULL,
  assigned_technician_id uuid REFERENCES public.technicians (id) ON DELETE SET NULL,

  booking_status text NOT NULL DEFAULT 'pending_payment' CHECK (booking_status IN (
    'pending_payment', 'confirmed', 'technician_assigned', 'in_progress',
    'completed', 'cancelled', 'rejected', 'payment_failed'
  )),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
    'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled'
  )),

  service_price_snapshot numeric(10, 2) NOT NULL DEFAULT 0 CHECK (service_price_snapshot >= 0),
  additional_task_price_snapshot numeric(10, 2) NOT NULL DEFAULT 0 CHECK (additional_task_price_snapshot >= 0),
  booking_fee_snapshot numeric(10, 2) NOT NULL DEFAULT 0 CHECK (booking_fee_snapshot >= 0),
  discount_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),

  customer_notes text,
  admin_notes text,
  cancellation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,

  CONSTRAINT bookings_contact_check CHECK (
    customer_user_id IS NOT NULL
    OR (guest_name IS NOT NULL AND guest_email IS NOT NULL AND guest_phone IS NOT NULL)
  ),
  CONSTRAINT bookings_email_format_check CHECK (guest_email IS NULL OR guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT bookings_reference_format_check CHECK (booking_reference ~ '^FX-[0-9]+$'),
  CONSTRAINT bookings_time_order_check CHECK (appointment_end_time > appointment_start_time)
);

CREATE INDEX bookings_appointment_idx ON public.bookings (appointment_date, appointment_start_time);

CREATE INDEX bookings_status_idx ON public.bookings (booking_status, appointment_date);

CREATE INDEX bookings_customer_idx ON public.bookings (customer_user_id) WHERE customer_user_id IS NOT NULL;

CREATE INDEX bookings_guest_email_idx ON public.bookings (lower(guest_email)) WHERE guest_email IS NOT NULL;

CREATE INDEX bookings_technician_idx ON public.bookings (assigned_technician_id) WHERE assigned_technician_id IS NOT NULL;

CREATE INDEX bookings_service_idx ON public.bookings (service_id);

CREATE INDEX bookings_created_at_idx ON public.bookings (created_at DESC);

CREATE TABLE public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_status_history_booking_idx ON public.booking_status_history (booking_id, created_at DESC);

CREATE TABLE public.technician_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians (id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assignment_status text NOT NULL DEFAULT 'assigned'
    CHECK (assignment_status IN ('assigned', 'reassigned', 'removed', 'completed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX technician_assignments_booking_idx ON public.technician_assignments (booking_id, assigned_at DESC);

CREATE INDEX technician_assignments_technician_idx ON public.technician_assignments (technician_id, assigned_at DESC);

CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  address_label text,
  city text NOT NULL,
  area text NOT NULL,
  street text,
  building_number text,
  apartment_number text,
  postal_code text,
  additional_directions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX addresses_customer_idx ON public.addresses (customer_user_id);

CREATE UNIQUE INDEX addresses_one_default_per_customer
  ON public.addresses (customer_user_id) WHERE is_default;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay', 'manual')),
  provider_transaction_id text,
  checkout_session_id text,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
  )),
  refund_status text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'requested', 'partial', 'full', 'failed')),
  refunded_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  transaction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX payments_booking_idx ON public.payments (booking_id);

CREATE INDEX payments_status_idx ON public.payments (payment_status, created_at DESC);

CREATE UNIQUE INDEX payments_provider_txn_key
  ON public.payments (provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX payments_checkout_session_key
  ON public.payments (provider, checkout_session_id) WHERE checkout_session_id IS NOT NULL;

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  technician_id uuid REFERENCES public.technicians (id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  visibility_status text NOT NULL DEFAULT 'pending' CHECK (visibility_status IN ('pending', 'published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_one_per_booking UNIQUE (booking_id)
);

CREATE INDEX reviews_service_idx ON public.reviews (service_id, visibility_status);

CREATE INDEX reviews_technician_idx ON public.reviews (technician_id) WHERE technician_id IS NOT NULL;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_status boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, read_status, created_at DESC);

CREATE INDEX notifications_booking_idx ON public.notifications (booking_id) WHERE booking_id IS NOT NULL;

CREATE TABLE public.booking_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_attachments_booking_idx ON public.booking_attachments (booking_id, uploaded_at DESC);

CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  email_type text NOT NULL,
  subject text NOT NULL,
  provider_message_id text,
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_logs_booking_idx ON public.email_logs (booking_id, created_at DESC);

CREATE INDEX email_logs_status_idx ON public.email_logs (delivery_status, created_at DESC);

CREATE TRIGGER app_config_touch BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER business_settings_touch BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER services_touch BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER service_tasks_touch BEFORE UPDATE ON public.service_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER technicians_touch BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER booking_slots_touch BEFORE UPDATE ON public.booking_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER addresses_touch BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER reviews_touch BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
