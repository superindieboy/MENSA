-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque : les policies sont recréées proprement.
--
-- La cave n'est PAS commune : chaque membre a la sienne, lui seul la voit
-- et la modifie.
--
-- Jusqu'ici la policy de lecture autorisait tout membre connecté à lire
-- l'intégralité de la table : chacun voyait donc le stock de tous les autres.
-- On la remplace par une lecture limitée à ses propres références.

drop policy if exists "cave_read"     on public.cave_items;
drop policy if exists "cave_read_own" on public.cave_items;
create policy "cave_read_own"
  on public.cave_items
  for select
  using (auth.uid() = user_id);

-- Une cave privée n'a pas à être modérée : on retire les droits
-- administrateur créés par erreur sur cette table.
drop policy if exists "cave_update_admin" on public.cave_items;
drop policy if exists "cave_delete_admin" on public.cave_items;

-- Vérification : doit lister uniquement les quatre policies « own »
-- (select / insert / update / delete), toutes limitées à auth.uid() = user_id.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'cave_items'
order by cmd, policyname;
