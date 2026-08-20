-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque : chaque policy est recréée proprement.
--
-- Autorise le compte administrateur à corriger n'importe quelle fiche du
-- catalogue, y compris celles créées par un autre membre.
-- Les autres membres restent limités à leurs propres fiches
-- (policies catalog_update_own / catalog_delete_own déjà en place).

-- Trace de la fiche embarquée corrigée : sans elle, un renommage laisserait
-- l'ancienne version en doublon dans le catalogue.
alter table public.catalog_items
  add column if not exists replaces text;

drop policy if exists "catalog_update_admin" on public.catalog_items;
create policy "catalog_update_admin"
  on public.catalog_items
  for update
  using (public.est_admin());

drop policy if exists "catalog_delete_admin" on public.catalog_items;
create policy "catalog_delete_admin"
  on public.catalog_items
  for delete
  using (public.est_admin());

-- Renommer une fiche doit rester rétroactif : les dégustations sont reliées
-- au catalogue par le nom du cigare. Sans cette policy, un renommage laisserait
-- l'historique des autres membres orphelin (fiche, note moyenne et rubrique
-- « Par le club » perdues).

drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_update_admin"
  on public.posts
  for update
  using (public.est_admin());

-- Rien pour cave_items, en revanche : chaque cave est privée, personne d'autre
-- que son propriétaire n'y écrit — pas même le modérateur. Un renommage de
-- fiche ne se répercute donc que sur la cave de celui qui le fait.
-- (Une version antérieure de ce script créait ici cave_update_admin ; la
--  réexécuter aurait rendu à l'administrateur un droit d'écriture sur le
--  stock de tous les membres.)
drop policy if exists "cave_update_admin" on public.cave_items;
drop policy if exists "cave_delete_admin" on public.cave_items;

-- Vérification : liste les policies administrateur réellement actives.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname like '%_admin'
order by tablename, policyname;
