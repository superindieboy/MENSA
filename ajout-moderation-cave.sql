-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque : la policy est recréée proprement.
--
-- La cave est commune au club : chacun y voit tout, mais ne pouvait retirer
-- que ses propres références. Les entrées déjà présentes, ajoutées par un
-- autre membre, restaient donc impossibles à supprimer.
-- Cette policy permet à l'administrateur de faire le ménage dans la cave.
-- Les membres restent limités à leurs propres références
-- (policy cave_delete_own déjà en place).
--
-- Le droit de MODIFICATION correspondant (cave_update_admin) est créé par
-- ajout-admin-catalogue.sql : exécutez-le aussi si ce n'est pas déjà fait.

drop policy if exists "cave_delete_admin" on public.cave_items;
create policy "cave_delete_admin"
  on public.cave_items
  for delete
  using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

-- Vérification : doit renvoyer les deux policies admin de la cave
-- (cave_delete_admin en DELETE, cave_update_admin en UPDATE).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'cave_items' and policyname like '%_admin'
order by policyname;
