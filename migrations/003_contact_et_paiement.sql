-- 003 — E-mail + téléphone de la cliente, rattachement à sa fiche, et devise du paiement
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Une seule commande : copier-coller tout le bloc ci-dessous, puis Entrée.
-- Sans risque : n'ajoute que des colonnes, ne supprime rien, ne modifie aucune
-- réservation existante, et peut être relancé sans danger.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS amount_total_cents int;

-- Recherche rapide d'une fiche cliente par e-mail (anti-doublon).
CREATE INDEX IF NOT EXISTS clients_email_lower_idx ON clients (lower(email)) WHERE email IS NOT NULL AND email <> '';

-- Vérification (facultative) : doit afficher les 4 colonnes
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('client_email','client_id','currency','amount_total_cents');
