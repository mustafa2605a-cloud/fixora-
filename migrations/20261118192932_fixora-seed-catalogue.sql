UPDATE public.business_settings
SET business_name = 'Fixora',
    currency = 'USD',
    default_booking_fee = 5,
    business_hours_start = '08:00',
    business_hours_end = '20:00',
    working_days = '{1,2,3,4,5,6}',
    default_service_duration_minutes = 60,
    slot_capacity = 3,
    max_advance_days = 30,
    min_lead_hours = 2,
    cancellation_policy = 'Free cancellation up to 2 hours before the appointment. Cancellations inside that window may be charged the booking fee.',
    booking_rules = 'Appointments are confirmed once payment is verified. A technician is assigned by the Fixora team before the visit.',
    notify_customer_email = true,
    notify_admin_email = true
WHERE id = true;

UPDATE public.app_config
SET admin_email = 'thatsbymustafa123@gmail.com'
WHERE id = true;

INSERT INTO public.services (name, slug, description, image, starting_price, estimated_duration, duration_minutes, display_order)
VALUES
  ('Plumbing', 'plumbing',
   'From dripping taps to burst pipes, our licensed plumbers diagnose and fix the problem on the first visit, with transparent upfront pricing.',
   '/images/services/plumbing.png', 49, '45–90 min', 90, 1),
  ('Electrical', 'electrical',
   'Certified electricians for outlets, switches, lighting installs, fuse box troubleshooting and full safety inspections.',
   '/images/services/electrical.png', 55, '30–120 min', 120, 2),
  ('AC Repair', 'ac-repair',
   'Keep cool with seasonal servicing, deep cleaning, refrigerant top-ups and professional split or window unit installation.',
   '/images/services/ac-repair.png', 59, '60–150 min', 150, 3),
  ('Home Cleaning', 'cleaning',
   'Background-checked cleaners with eco-friendly supplies for regular, deep and move-in/move-out cleaning.',
   '/images/services/cleaning.png', 79, '2–5 hrs', 240, 4),
  ('Carpentry', 'carpentry',
   'Skilled carpenters for flat-pack assembly, door and hinge repairs, custom shelving and woodwork touch-ups.',
   '/images/services/carpentry.png', 45, '1–3 hrs', 180, 5),
  ('Painting', 'painting',
   'Clean, precise interior painting with premium low-VOC paints, careful prep and furniture protection included.',
   '/images/services/painting.png', 129, '1–3 days', 480, 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.service_tasks (service_id, name, additional_price, display_order)
SELECT s.id, t.task_name, t.price, t.sort_order
FROM (
  VALUES
    ('plumbing', 'Tap / faucet repair', 49.00, 1),
    ('plumbing', 'Drain unclogging', 69.00, 2),
    ('plumbing', 'Toilet repair', 59.00, 3),
    ('plumbing', 'Water heater service', 119.00, 4),
    ('electrical', 'Outlet / switch install', 55.00, 1),
    ('electrical', 'Ceiling light / fan install', 79.00, 2),
    ('electrical', 'Fuse box diagnostics', 89.00, 3),
    ('electrical', 'Full safety inspection', 149.00, 4),
    ('ac-repair', 'AC service & cleaning', 59.00, 1),
    ('ac-repair', 'Gas top-up', 99.00, 2),
    ('ac-repair', 'Repair & diagnostics', 79.00, 3),
    ('ac-repair', 'Split unit installation', 199.00, 4),
    ('cleaning', 'Standard clean (2 hrs)', 79.00, 1),
    ('cleaning', 'Deep clean (4 hrs)', 149.00, 2),
    ('cleaning', 'Move-in / move-out clean', 219.00, 3),
    ('cleaning', 'Sofa & carpet shampoo', 99.00, 4),
    ('carpentry', 'Furniture assembly', 45.00, 1),
    ('carpentry', 'Door / hinge repair', 55.00, 2),
    ('carpentry', 'Shelf & TV mounting', 65.00, 3),
    ('carpentry', 'Custom woodwork (per hr)', 70.00, 4),
    ('painting', 'Wall touch-up', 129.00, 1),
    ('painting', 'Single room repaint', 349.00, 2),
    ('painting', 'Ceiling painting', 199.00, 3),
    ('painting', 'Full apartment repaint', 1290.00, 4)
) AS t (service_slug, task_name, price, sort_order)
JOIN public.services AS s ON s.slug = t.service_slug
ON CONFLICT (service_id, name) DO NOTHING;

INSERT INTO public.service_areas (city, area_name)
VALUES
  ('Dubai', 'Downtown Dubai'), ('Dubai', 'Dubai Marina'), ('Dubai', 'Business Bay'),
  ('Dubai', 'Deira'), ('Dubai', 'Jumeirah'),
  ('Abu Dhabi', 'Al Reem Island'), ('Abu Dhabi', 'Khalifa City'), ('Abu Dhabi', 'Al Mushrif'),
  ('London', 'Camden'), ('London', 'Westminster'), ('London', 'Islington'), ('London', 'Hackney'),
  ('Manchester', 'Didsbury'), ('Manchester', 'Chorlton'), ('Manchester', 'Salford'),
  ('Doha', 'West Bay'), ('Doha', 'Al Sadd'), ('Doha', 'The Pearl'),
  ('Riyadh', 'Al Olaya'), ('Riyadh', 'Al Malaz'), ('Riyadh', 'Al Nakheel'),
  ('Toronto', 'Downtown Toronto'), ('Toronto', 'North York'), ('Toronto', 'Scarborough'),
  ('Sydney', 'Bondi'), ('Sydney', 'Parramatta'), ('Sydney', 'Chatswood')
ON CONFLICT (city, area_name) DO NOTHING;

INSERT INTO public.technicians (full_name, phone, description, availability_status, average_rating)
VALUES
  ('Omar Khalid', '+1 555 0101', 'Master plumber, 12 years of residential emergency work.', 'on_job', 4.90),
  ('Lina Haddad', '+1 555 0102', 'Licensed electrician specialising in safety inspections.', 'available', 4.90),
  ('Ahmed Rashid', '+1 555 0103', 'HVAC technician for split and window units.', 'available', 4.80),
  ('Grace Lee', '+1 555 0104', 'Deep-clean specialist and team lead.', 'on_job', 5.00),
  ('Yusuf Demir', '+1 555 0105', 'Carpenter for fitted furniture and door repairs.', 'off_duty', 4.70),
  ('Carlos Mendes', '+1 555 0106', 'Interior painter, low-VOC finishes.', 'available', 4.80)
ON CONFLICT DO NOTHING;

INSERT INTO public.technician_skills (technician_id, service_id, skill_description)
SELECT t.id, s.id, t.full_name || ' — ' || s.name
FROM public.technicians AS t
JOIN public.services AS s ON s.slug = CASE t.full_name
  WHEN 'Omar Khalid' THEN 'plumbing'
  WHEN 'Lina Haddad' THEN 'electrical'
  WHEN 'Ahmed Rashid' THEN 'ac-repair'
  WHEN 'Grace Lee' THEN 'cleaning'
  WHEN 'Yusuf Demir' THEN 'carpentry'
  WHEN 'Carlos Mendes' THEN 'painting'
END
ON CONFLICT DO NOTHING;
