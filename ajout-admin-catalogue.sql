-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Autorise le compte administrateur à corriger n'importe quelle fiche du
-- catalogue, y compris celles créées par un autre membre.
-- Les autres membres restent limités à leurs propres fiches
-- (policies catalog_update_own / catalog_delete_own déjà en place).

-- Trace de la fiche embarquée corrigée : sans elle, un renommage laisserait
-- l'ancienne version en doublon dans le catalogue.
alter table public.catalog_items
  add column if not exists replaces text;

create policy "catalog_update_admin"
  on public.catalog_items
  for update
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

create policy "catalog_delete_admin"
  on public.catalog_items
  for delete
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

-- Renommer une fiche doit rester rétroactif : les dégustations et les
-- références de cave sont reliées au catalogue par le nom du cigare.
-- Sans ces deux policies, un renommage laisserait l'historique des autres
-- membres orphelin (fiche, note moyenne et rubrique « Par le club » perdues).

create policy "posts_update_admin"
  on public.posts
  for update
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

create policy "cave_update_admin"
  on public.cave_items
  for update
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
