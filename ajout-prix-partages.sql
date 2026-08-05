-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Partage des prix d'achat entre membres, sans partager les caves.
--
-- Les caves sont privées : cave_read_own interdit de lire celle d'un autre.
-- Pour afficher « dernier prix payé » sur une dégustation, il faut donc une
-- vue qui expose le prix, le pays et la date SANS le propriétaire.
--
-- security_invoker = false est ici DÉLIBÉRÉ : la vue s'exécute avec les droits
-- de son propriétaire et contourne donc la RLS de cave_items. C'est ce qui
-- permet de lire les prix de tous sans ouvrir les caves elles-mêmes.
-- Aucune colonne ne permet de remonter à un membre : ni user_id, ni id.

create or replace view public.cave_prices
with (security_invoker = false) as
  select
    name,
    terroir,
    price,
    bought_in,
    added
  from public.cave_items
  where price is not null
    and added is not null;

alter view public.cave_prices owner to postgres;

revoke all on public.cave_prices from anon;
grant select on public.cave_prices to authenticated;

-- Vérification : doit renvoyer des lignes sans aucune colonne identifiante.
select * from public.cave_prices limit 5;
