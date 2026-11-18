export type ServiceCategory = {
  slug: string
  name: string
  short: string
  description: string
  image: string
  startingPrice: number
  duration: string
  rating: number
  jobsDone: number
  icon: 'wrench' | 'zap' | 'snowflake' | 'sparkles' | 'hammer' | 'paintbrush'
  includes: string[]
  tasks: { name: string; price: number }[]
}

export const services: ServiceCategory[] = [
  {
    slug: 'plumbing',
    name: 'Plumbing',
    short: 'Leaks, clogs, taps and water heaters fixed fast.',
    description:
      'From dripping taps to burst pipes, our licensed plumbers diagnose and fix the problem on the first visit, with transparent upfront pricing.',
    image: '/images/services/plumbing.png',
    startingPrice: 49,
    duration: '45–90 min',
    rating: 4.9,
    jobsDone: 3420,
    icon: 'wrench',
    includes: ['Leak detection', 'Drain unclogging', 'Tap & mixer replacement', 'Water heater service'],
    tasks: [
      { name: 'Tap / faucet repair', price: 49 },
      { name: 'Drain unclogging', price: 69 },
      { name: 'Toilet repair', price: 59 },
      { name: 'Water heater service', price: 119 },
    ],
  },
  {
    slug: 'electrical',
    name: 'Electrical',
    short: 'Safe wiring, outlets, lighting and fuse boxes.',
    description:
      'Certified electricians for outlets, switches, lighting installs, fuse box troubleshooting and full safety inspections.',
    image: '/images/services/electrical.png',
    startingPrice: 55,
    duration: '30–120 min',
    rating: 4.8,
    jobsDone: 2810,
    icon: 'zap',
    includes: ['Outlet & switch install', 'Light fixtures', 'Fuse box diagnostics', 'Safety inspection'],
    tasks: [
      { name: 'Outlet / switch install', price: 55 },
      { name: 'Ceiling light / fan install', price: 79 },
      { name: 'Fuse box diagnostics', price: 89 },
      { name: 'Full safety inspection', price: 149 },
    ],
  },
  {
    slug: 'ac-repair',
    name: 'AC Repair',
    short: 'Servicing, gas top-ups and installations.',
    description:
      'Keep cool with seasonal servicing, deep cleaning, refrigerant top-ups and professional split or window unit installation.',
    image: '/images/services/ac-repair.png',
    startingPrice: 59,
    duration: '60–150 min',
    rating: 4.8,
    jobsDone: 1950,
    icon: 'snowflake',
    includes: ['Filter & coil cleaning', 'Gas top-up', 'Noise & leak fixes', 'New unit install'],
    tasks: [
      { name: 'AC service & cleaning', price: 59 },
      { name: 'Gas top-up', price: 99 },
      { name: 'Repair & diagnostics', price: 79 },
      { name: 'Split unit installation', price: 199 },
    ],
  },
  {
    slug: 'cleaning',
    name: 'Home Cleaning',
    short: 'Deep cleans, move-in/out and regular visits.',
    description:
      'Background-checked cleaners with eco-friendly supplies for regular, deep and move-in/move-out cleaning.',
    image: '/images/services/cleaning.png',
    startingPrice: 79,
    duration: '2–5 hrs',
    rating: 4.9,
    jobsDone: 5120,
    icon: 'sparkles',
    includes: ['Kitchen & bathrooms', 'Dusting & vacuuming', 'Eco-friendly supplies', 'Move-in / move-out'],
    tasks: [
      { name: 'Standard clean (2 hrs)', price: 79 },
      { name: 'Deep clean (4 hrs)', price: 149 },
      { name: 'Move-in / move-out clean', price: 219 },
      { name: 'Sofa & carpet shampoo', price: 99 },
    ],
  },
  {
    slug: 'carpentry',
    name: 'Carpentry',
    short: 'Furniture assembly, doors, shelves and repairs.',
    description:
      'Skilled carpenters for flat-pack assembly, door and hinge repairs, custom shelving and woodwork touch-ups.',
    image: '/images/services/carpentry.png',
    startingPrice: 45,
    duration: '1–3 hrs',
    rating: 4.7,
    jobsDone: 1640,
    icon: 'hammer',
    includes: ['Furniture assembly', 'Door & lock repair', 'Shelving & mounting', 'Woodwork repairs'],
    tasks: [
      { name: 'Furniture assembly', price: 45 },
      { name: 'Door / hinge repair', price: 55 },
      { name: 'Shelf & TV mounting', price: 65 },
      { name: 'Custom woodwork (per hr)', price: 70 },
    ],
  },
  {
    slug: 'painting',
    name: 'Painting',
    short: 'Interior walls, touch-ups and full repaints.',
    description:
      'Clean, precise interior painting with premium low-VOC paints, careful prep and furniture protection included.',
    image: '/images/services/painting.png',
    startingPrice: 129,
    duration: '1–3 days',
    rating: 4.8,
    jobsDone: 980,
    icon: 'paintbrush',
    includes: ['Surface prep & patching', 'Premium low-VOC paint', 'Furniture protection', 'Post-job cleanup'],
    tasks: [
      { name: 'Wall touch-up', price: 129 },
      { name: 'Single room repaint', price: 349 },
      { name: 'Ceiling painting', price: 199 },
      { name: 'Full apartment repaint', price: 1290 },
    ],
  },
]

export function getService(slug: string) {
  return services.find((s) => s.slug === slug)
}

export const timeSlots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']

export type BookingStatus = 'Pending' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled'

export type Booking = {
  id: string
  customer: string
  email: string
  service: string
  task: string
  technician: string
  date: string
  time: string
  amount: number
  status: BookingStatus
  address: string
}

export const bookings: Booking[] = [
  { id: 'FX-10482', customer: 'Sara Ahmed', email: 'sara.ahmed@example.com', service: 'Plumbing', task: 'Drain unclogging', technician: 'Omar Khalid', date: '2026-11-17', time: '10:00', amount: 69, status: 'In Progress', address: '12 Palm Street, Apt 4' },
  { id: 'FX-10481', customer: 'James Carter', email: 'j.carter@example.com', service: 'Electrical', task: 'Ceiling light / fan install', technician: 'Lina Haddad', date: '2026-11-17', time: '12:00', amount: 79, status: 'Confirmed', address: '88 Oak Avenue' },
  { id: 'FX-10480', customer: 'Mariam Yousef', email: 'mariam.y@example.com', service: 'Home Cleaning', task: 'Deep clean (4 hrs)', technician: 'Grace Lee', date: '2026-11-17', time: '14:00', amount: 149, status: 'Confirmed', address: '5 Cedar Court' },
  { id: 'FX-10479', customer: 'Daniel Brooks', email: 'dan.brooks@example.com', service: 'AC Repair', task: 'Gas top-up', technician: 'Ahmed Rashid', date: '2026-11-16', time: '16:00', amount: 99, status: 'Completed', address: '230 Harbor Road' },
  { id: 'FX-10478', customer: 'Noor Hassan', email: 'noor.h@example.com', service: 'Carpentry', task: 'Furniture assembly', technician: 'Yusuf Demir', date: '2026-11-16', time: '10:00', amount: 45, status: 'Completed', address: '41 Willow Lane' },
  { id: 'FX-10477', customer: 'Emily Chen', email: 'emily.chen@example.com', service: 'Painting', task: 'Single room repaint', technician: 'Carlos Mendes', date: '2026-11-18', time: '08:00', amount: 349, status: 'Pending', address: '9 Maple Drive' },
  { id: 'FX-10476', customer: 'Khalid Nasser', email: 'k.nasser@example.com', service: 'Plumbing', task: 'Water heater service', technician: 'Omar Khalid', date: '2026-11-15', time: '18:00', amount: 119, status: 'Completed', address: '77 River View' },
  { id: 'FX-10475', customer: 'Olivia Martin', email: 'olivia.m@example.com', service: 'Electrical', task: 'Full safety inspection', technician: 'Lina Haddad', date: '2026-11-15', time: '12:00', amount: 149, status: 'Cancelled', address: '3 Birch Street' },
  { id: 'FX-10474', customer: 'Ali Raza', email: 'ali.raza@example.com', service: 'Home Cleaning', task: 'Move-in / move-out clean', technician: 'Grace Lee', date: '2026-11-18', time: '10:00', amount: 219, status: 'Pending', address: '150 Sunset Blvd' },
  { id: 'FX-10473', customer: 'Hannah Wright', email: 'hannah.w@example.com', service: 'AC Repair', task: 'AC service & cleaning', technician: 'Ahmed Rashid', date: '2026-11-14', time: '14:00', amount: 59, status: 'Completed', address: '62 Lakeside Ave' },
  { id: 'FX-10472', customer: 'Fatima Zahra', email: 'fatima.z@example.com', service: 'Carpentry', task: 'Shelf & TV mounting', technician: 'Yusuf Demir', date: '2026-11-19', time: '16:00', amount: 65, status: 'Confirmed', address: '18 Garden Row' },
  { id: 'FX-10471', customer: 'Michael Scott', email: 'm.scott@example.com', service: 'Plumbing', task: 'Toilet repair', technician: 'Omar Khalid', date: '2026-11-14', time: '08:00', amount: 59, status: 'Completed', address: '1725 Slough Ave' },
]

export type Technician = {
  id: string
  name: string
  specialty: string
  rating: number
  jobs: number
  status: 'Available' | 'On Job' | 'Off Duty'
  phone: string
  initials: string
}

export const technicians: Technician[] = [
  { id: 'T-01', name: 'Omar Khalid', specialty: 'Plumbing', rating: 4.9, jobs: 612, status: 'On Job', phone: '+1 555 0101', initials: 'OK' },
  { id: 'T-02', name: 'Lina Haddad', specialty: 'Electrical', rating: 4.9, jobs: 540, status: 'Available', phone: '+1 555 0102', initials: 'LH' },
  { id: 'T-03', name: 'Ahmed Rashid', specialty: 'AC Repair', rating: 4.8, jobs: 433, status: 'Available', phone: '+1 555 0103', initials: 'AR' },
  { id: 'T-04', name: 'Grace Lee', specialty: 'Home Cleaning', rating: 5.0, jobs: 820, status: 'On Job', phone: '+1 555 0104', initials: 'GL' },
  { id: 'T-05', name: 'Yusuf Demir', specialty: 'Carpentry', rating: 4.7, jobs: 298, status: 'Off Duty', phone: '+1 555 0105', initials: 'YD' },
  { id: 'T-06', name: 'Carlos Mendes', specialty: 'Painting', rating: 4.8, jobs: 214, status: 'Available', phone: '+1 555 0106', initials: 'CM' },
]

export type Customer = {
  id: string
  name: string
  email: string
  bookings: number
  spent: number
  joined: string
  city: string
}

export const customers: Customer[] = [
  { id: 'C-301', name: 'Sara Ahmed', email: 'sara.ahmed@example.com', bookings: 8, spent: 642, joined: '2025-03-12', city: 'Dubai' },
  { id: 'C-302', name: 'James Carter', email: 'j.carter@example.com', bookings: 3, spent: 227, joined: '2025-07-04', city: 'London' },
  { id: 'C-303', name: 'Mariam Yousef', email: 'mariam.y@example.com', bookings: 12, spent: 1384, joined: '2024-11-21', city: 'Abu Dhabi' },
  { id: 'C-304', name: 'Daniel Brooks', email: 'dan.brooks@example.com', bookings: 5, spent: 411, joined: '2025-01-30', city: 'Manchester' },
  { id: 'C-305', name: 'Noor Hassan', email: 'noor.h@example.com', bookings: 2, spent: 90, joined: '2026-02-14', city: 'Doha' },
  { id: 'C-306', name: 'Emily Chen', email: 'emily.chen@example.com', bookings: 6, spent: 980, joined: '2025-05-09', city: 'Toronto' },
  { id: 'C-307', name: 'Khalid Nasser', email: 'k.nasser@example.com', bookings: 4, spent: 356, joined: '2025-09-18', city: 'Riyadh' },
  { id: 'C-308', name: 'Olivia Martin', email: 'olivia.m@example.com', bookings: 1, spent: 0, joined: '2026-10-02', city: 'Sydney' },
]

export const monthlyRevenue = [
  { month: 'Jun', value: 18400 },
  { month: 'Jul', value: 21900 },
  { month: 'Aug', value: 24300 },
  { month: 'Sep', value: 22800 },
  { month: 'Oct', value: 27600 },
  { month: 'Nov', value: 31200 },
]

export const testimonials = [
  { name: 'Sara A.', role: 'Homeowner', quote: 'Booked a plumber at 9am and the leak was fixed before lunch. Clear pricing, zero hassle.', rating: 5 },
  { name: 'James C.', role: 'Landlord', quote: 'I manage four flats and Fixora is now the only app I use for repairs. The technicians are reliable.', rating: 5 },
  { name: 'Mariam Y.', role: 'Busy parent', quote: 'The deep clean was incredible. Being able to pick an exact time slot is a game changer.', rating: 5 },
]

export const faqs = [
  { q: 'How quickly can a technician arrive?', a: 'Most bookings are served the same day. You choose the exact slot that suits you during checkout.' },
  { q: 'Are your technicians verified?', a: 'Every professional is background-checked, skills-tested and insured before joining Fixora.' },
  { q: 'How does pricing work?', a: 'You see a transparent starting price before booking. Any additional parts are approved by you before work begins.' },
  { q: 'What if I am not happy with the job?', a: 'Every job is covered by our 30-day Fixora Guarantee. We will send someone back to make it right, free of charge.' },
]

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}
