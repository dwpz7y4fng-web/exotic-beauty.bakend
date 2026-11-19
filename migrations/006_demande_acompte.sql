-- 006 — Demande d'acompte automatique (WhatsApp, 8 jours avant le rendez-vous)
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Copier-coller la ligne ci-dessous, puis Entrée.
-- Sans risque : ajoute une colonne vide, ne modifie aucune réservation, peut être relancé.
-- ⚠️ La migration 005 (paid_cents) doit être passée avant : sans elle, la demande reste en veille.

-- Date d'envoi du message « réglez votre acompte » (vide = pas encore envoyé).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_request_sent_at timestamptz;

-- Vérification (facultative) : doit afficher la colonne deposit_request_sent_at.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'deposit_request_sent_at';
