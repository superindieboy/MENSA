-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Les cigares qui ne se vendent pas en France.
--
-- Une exclusivité régionale — BELUX, Asie-Pacifique — ou réservée à une
-- enseigne, comme le Plasencia Lancero Selección de Dominique London, n'a pas
-- de tarif français : le relevé du 1er juin ne l'a jamais publié, et ce qu'on
-- y trouverait sous ce nom serait un autre cigare, donc un prix faux.
--
-- Une seule colonne suffit : son contenu nomme l'exclusivité, son absence dit
-- que le cigare se vend ici comme les autres. Une case cochée sans nom ne
-- voudrait rien dire — l'application refuse la fiche plutôt que de
-- l'enregistrer à moitié.
--
-- Ces cigares comptent dans la valeur de la cave au même titre que les
-- autres : c'est le seul prix qu'ils aient, et les écarter du total ne le
-- rendrait pas plus juste, seulement plus court.

alter table public.catalog_items
  add column if not exists exclusivite text;

-- Un libellé, pas un paragraphe : « BELUX », « Dominique London ».
alter table public.catalog_items
  drop constraint if exists catalog_items_exclusivite_breve;
alter table public.catalog_items
  add constraint catalog_items_exclusivite_breve
  check (exclusivite is null or length(exclusivite) between 1 and 80);

-- Aucune policy à ajouter : catalog_items n'a pas de privilèges par colonne,
-- les règles existantes couvrent la nouvelle.

-- Vérification : la colonne existe, et le nombre de fiches déjà marquées.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='catalog_items'
      and column_name='exclusivite') as colonne_exclusivite,
  (select count(*) from public.catalog_items
    where exclusivite is not null and exclusivite <> '') as fiches_exclusives;
