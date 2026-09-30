-- 001 — Offre regard (cils + brow lift) + durée du wispy mixte
-- À exécuter À LA MAIN dans la console SQL de ta base (Railway → Postgres → Query / Data).
-- Tout est dans une transaction : si une étape échoue, rien n'est modifié.
-- Tu peux le relancer sans risque : il ne crée pas de doublon.

-- 1) VÉRIFIER avant (tu dois voir wispy_mixte à 140 min, et aucune ligne « offre_… »)
select id, label, duration_minutes, price_cents, deposit_cents
from services
where id like 'offre_%' or id = 'wispy_mixte';

-- 2) MODIFIER
begin;

insert into services (id, label, duration_minutes, price_cents, deposit_cents) values
  ('offre_cil_a_cil',    'Offre regard : cil à cil + brow lift',     105,  8000, 2500),
  ('offre_mixte',        'Offre regard : mixte + brow lift',         150,  9000, 3000),
  ('offre_volume_russe', 'Offre regard : volume russe + brow lift',  165, 11000, 3500)
on conflict (id) do nothing;

update services set duration_minutes = 100 where id = 'wispy_mixte';

commit;

-- 3) CONFIRMER après (tu dois voir les 3 offres à 80 / 90 / 110 €, et wispy_mixte à 100 min)
select id, label, duration_minutes, price_cents / 100 as prix_euros, deposit_cents / 100 as acompte_euros
from services
where id like 'offre_%' or id = 'wispy_mixte'
order by price_cents;
