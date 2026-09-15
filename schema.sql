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
  ('cil_a_cil', 'Extensions cil à cil', 60, 6000, 2000),
  ('mixte', 'Extensions mixte', 90, 7000, 2500),
  ('volume_russe', 'Volume russe', 120, 9000, 3000),
  ('lash_lift', 'Lash lift avec teinture', 45, 6000, 2000),
  ('sourcils_ombre', 'Sourcils ombré powder', 90, 20000, 6000),
  ('brow_lift', 'Brow lift', 30, 3500, 1000),
  ('teinture', 'Teinture', 15, 1500, 500),
  ('epilation_fil', 'Épilation au fil', 15, 1000, 500);

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
