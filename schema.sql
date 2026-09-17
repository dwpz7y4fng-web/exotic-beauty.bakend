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
  ('cil_a_cil', 'Cil à cil', 60, 6000, 2000),
  ('mixte', 'Mixte', 90, 7000, 2500),
  ('volume_russe', 'Volume russe', 120, 9000, 3000),
  ('lash_lift', 'Lash lift avec teinture', 45, 6000, 2000),
  ('wispy_volume_russe', 'Wispy volume russe', 130, 9500, 3000),
  ('wispy_mixte', 'Wispy pose mixte', 140, 7500, 2500),
  ('wet_volume_russe', 'Wet volume russe', 130, 9500, 3000),
  ('wispy_cil_a_cil', 'Wispy pose cil à cil', 70, 5500, 1800),
  ('remplissage_cil_a_cil', 'Remplissage cil à cil', 45, 3000, 1000),
  ('remplissage_mixte', 'Remplissage mixte', 75, 3500, 1200),
  ('remplissage_volume_russe', 'Remplissage volume russe', 105, 4500, 1500),
  ('depose', 'Dépose', 25, 2000, 800),
  ('ombre_powder_brow', 'Ombré powder brow', 90, 20000, 6000),
  ('epilation_restructuration', 'Épilation au fil (restructuration)', 15, 1500, 500),
  ('epilation_entretien', 'Épilation au fil (entretien)', 10, 1000, 400),
  ('epilation_levres', 'Épilation lèvres supérieur', 5, 1000, 400),
  ('brow_lift', 'Brow lift (sans teinture)', 30, 3500, 1000),
  ('brow_lift_teinture', 'Brow lift avec teinture', 90, 6000, 2000),
  ('teinture_hybride', 'Teinture hybride', 45, 3500, 1200);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  service_ids text[] not null,
  slot_date date not null,
  slot_time time not null,
  client_name text not null,
  client_phone text not null,
  status text not null default 'pending',
  stripe_session_id text,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- A cancelled booking must free up its slot, so the "one booking per
-- slot" rule only applies to non-cancelled rows.
create unique index bookings_active_slot_unique on bookings (slot_date, slot_time) where status != 'cancelled';

create index on bookings (slot_date, status);

drop table if exists clients;

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  comments text,
  gender text,
  planity_created_at date,
  planity_deleted_at date,
  imported_at timestamptz not null default now(),
  last_reengagement_sms_at timestamptz
);

create unique index clients_phone_unique on clients (phone) where phone is not null and phone != '';
create index on clients (name);
