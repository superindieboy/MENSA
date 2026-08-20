-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque : la policy est recréée proprement.
--
-- Le bouton « Supprimer (modération) » proposé à l'administrateur sur les
-- dégustations des autres membres n'avait aucune policy correspondante :
-- la suppression était refusée par RLS et ne retirait rien.
-- Les membres restent limités à leurs propres publications
-- (policy posts_delete_own déjà en place).

drop policy if exists "posts_delete_admin" on public.posts;
create policy "posts_delete_admin"
  on public.posts
  for delete
  using (public.est_admin());

-- Vérification : doit renvoyer une ligne « posts / posts_delete_admin / DELETE ».
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and policyname = 'posts_delete_admin';
