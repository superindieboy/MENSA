-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Le tarif homologué d'une fiche, corrigeable dans l'app.
--
-- Les 242 tarifs repris du Journal officiel du 1er juin 2026 vivent dans le
-- catalogue embarqué de index.html : ils sont figés jusqu'au prochain barème.
-- Cette colonne sert à ce que l'app ne pouvait pas faire jusqu'ici — corriger
-- un tarif, ou en donner un aux 616 fiches qui n'en ont pas.
--
-- Une fiche membre qui corrige une fiche embarquée porte « replaces » : son
-- tarif l'emporte alors sur celui du catalogue, et son absence laisse le tarif
-- d'origine en place. C'est l'application qui arbitre, à la lecture.

alter table public.catalog_items
  add column if not exists tarif numeric(10,2);

-- Un tarif nul ou négatif n'est pas une correction, c'est une faute de saisie.
alter table public.catalog_items
  drop constraint if exists catalog_items_tarif_positif;
alter table public.catalog_items
  add constraint catalog_items_tarif_positif
  check (tarif is null or tarif > 0);

-- Aucune policy à ajouter : catalog_items n'a pas de privilèges par colonne,
-- les règles existantes couvrent la nouvelle.

-- Vérification : la colonne existe, et le nombre de fiches déjà chiffrées.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='catalog_items' and column_name='tarif') as colonne_tarif,
  (select count(*) from public.catalog_items where tarif is not null) as fiches_chiffrees;
