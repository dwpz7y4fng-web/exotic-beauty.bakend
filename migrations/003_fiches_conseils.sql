-- 003 — Fiches de conseils post-séance (envoi automatique WhatsApp)
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Copier-coller tout le bloc ci-dessous, puis Entrée.
-- Sans risque : ne supprime rien, ne modifie aucune réservation existante, peut être relancé.

-- Petits réglages du site (ex. interrupteur des fiches de conseils).
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Historique des fiches envoyées : une ligne par rendez-vous + fiche.
CREATE TABLE IF NOT EXISTS care_sheets_sent (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  fiche             text NOT NULL,
  client_phone_e164 text,
  manual            boolean NOT NULL DEFAULT false,
  sent_at           timestamptz NOT NULL DEFAULT now()
);

-- Empêche d'envoyer deux fois la même fiche pour un même rendez-vous.
CREATE UNIQUE INDEX IF NOT EXISTS care_sheets_sent_booking_fiche_unique
  ON care_sheets_sent (booking_id, fiche);

-- Pour retrouver vite si une cliente (par son numéro) a déjà reçu une fiche.
CREATE INDEX IF NOT EXISTS care_sheets_sent_phone_fiche
  ON care_sheets_sent (client_phone_e164, fiche);

-- Vérification (facultative) : doit afficher les 2 tables.
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('app_settings', 'care_sheets_sent');
