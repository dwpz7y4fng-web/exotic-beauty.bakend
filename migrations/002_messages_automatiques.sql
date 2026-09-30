-- 002 — Messages automatiques WhatsApp (confirmation, notification, rappel, avis, remplissage)
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Une seule commande : copier-coller tout le bloc ci-dessous, puis Entrée.
-- Sans risque : ne supprime rien, ne modifie aucune réservation existante, peut être relancé.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS client_phone_e164 text,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS refill_sent_at timestamptz;

-- Vérification (facultative) : doit afficher les 5 colonnes
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('client_phone_e164','confirmation_sent_at','owner_notified_at','review_sent_at','refill_sent_at');
