-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Le bouton « Supprimer (modération) » proposé à l'administrateur sur les
-- dégustations des autres membres n'avait aucune policy correspondante :
-- la suppression était refusée par RLS et ne retirait rien.
-- Les membres restent limités à leurs propres publications
-- (policy posts_delete_own déjà en place).

create policy "posts_delete_admin"
  on public.posts
  for delete
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
