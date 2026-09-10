drop table if exists bookings;
drop table if exists services;

create table services (
  id text primary key,
  label text not null,
  duration_minutes int not null,
  price_cents int not null,
  deposit_cents int not null
);

insert into services (id, label, duration_minutes, price_cents, deposit_cents) values
  ('cils', 'Extensions de cils', 90, 6000, 2000),
  ('liftcils', 'Lash lift', 60, 4000, 1500),
  ('sourcils', 'Sourcils ombrés', 120, 9000, 3000),
  ('visage', 'Soin du visage', 60, 5000, 1500),
  ('pieds', 'Rituel des pieds', 60, 3500, 1000);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  service_id text references services(id) not null,
  slot_date date not null,
  slot_time time not null,
  client_name text not null,
  client_phone text not null,
  status text not null default 'pending',
  stripe_session_id text,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (slot_date, slot_time)
);

create index on bookings (slot_date, status);
