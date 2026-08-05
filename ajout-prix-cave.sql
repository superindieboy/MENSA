-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Prix payé pour une référence de cave, à l'unité et en euros.
-- Numérique à deux décimales : on ne stocke pas un prix en flottant,
-- les arrondis y sont imprévisibles.

alter table public.cave_items
  add column if not exists price numeric(10,2);

-- Vérification : doit renvoyer une ligne « price | numeric ».
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'cave_items' and column_name = 'price';
