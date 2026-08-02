-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Autorise le compte administrateur à corriger n'importe quelle fiche du
-- catalogue, y compris celles créées par un autre membre.
-- Les autres membres restent limités à leurs propres fiches
-- (policies catalog_update_own / catalog_delete_own déjà en place).

create policy "catalog_update_admin"
  on public.catalog_items
  for update
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

create policy "catalog_delete_admin"
  on public.catalog_items
  for delete
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
