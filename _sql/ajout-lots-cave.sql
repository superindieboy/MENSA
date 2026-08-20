-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Un même cigare peut avoir été acheté plusieurs fois, à des prix différents
-- selon la date et le pays. Chaque ligne de cave_items devient donc un LOT
-- d'achat : même cigare, mais quantité, prix, date et pays qui lui sont propres.
--
-- Rien à migrer : la table portait déjà la quantité, la date et le prix.
-- Il ne manquait que le pays d'achat, et la possibilité d'avoir plusieurs
-- lignes pour un même cigare — qu'aucune contrainte n'empêchait.

alter table public.cave_items
  add column if not exists price     numeric(10,2),   -- prix payé, à l'unité, en euros
  add column if not exists bought_in text;            -- pays d'achat, distinct du terroir du cigare

-- Vérification : doit renvoyer les deux colonnes.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'cave_items'
  and column_name in ('price','bought_in')
order by column_name;
