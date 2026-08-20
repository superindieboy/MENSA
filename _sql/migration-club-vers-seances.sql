-- À exécuter dans Supabase → SQL Editor, APRÈS ajout-seances.sql.
-- Réexécutable sans risque : ne traite que ce qui n'a pas déjà été migré.
--
-- « Par le club » et les séances disaient la même chose : le cercle se réunit
-- autour d'un cigare. Les deux fusionnent, et cette migration transforme
-- chaque sélection existante en séance plutôt que de la laisser invisible.
--
-- Une sélection = une dégustation cochée « par le club ». Plusieurs
-- dégustations pouvaient désigner le même cigare : elles n'apparaissaient
-- qu'une fois dans la rubrique, donc elles ne forment ici qu'une seule séance,
-- datée de la première et rattachée à son auteur.

do $$
declare g record; nouvelle uuid;
begin
  for g in
    select coalesce(catalog_id, lower(cigar_name)) as cle, min(created_at) as premiere
    from public.posts
    where is_club and session_id is null
    group by coalesce(catalog_id, lower(cigar_name))
  loop
    -- l'organisateur, la fiche et le terroir viennent de la première du groupe
    insert into public.tasting_sessions (user_id, cigar_name, catalog_id, terroir, held_on)
    select p.user_id, p.cigar_name, p.catalog_id, p.terroir, p.created_at::date
    from public.posts p
    where p.is_club and p.session_id is null
      and coalesce(p.catalog_id, lower(p.cigar_name)) = g.cle
      and p.created_at = g.premiere
    limit 1
    returning id into nouvelle;

    -- toutes les dégustations du même cigare rejoignent la séance : elles
    -- deviennent ses premières lectures, à confronter
    update public.posts
    set session_id = nouvelle
    where is_club and session_id is null
      and coalesce(catalog_id, lower(cigar_name)) = g.cle;
  end loop;
end $$;

-- La colonne is_club n'est plus lue ni écrite par l'application. On la garde :
-- elle est la trace de ce qui a été migré, et la supprimer ne rendrait rien.

-- Vérification : autant de séances que de cigares distincts jadis « par le
-- club », et plus aucune sélection orpheline.
select
  (select count(*) from public.tasting_sessions)                             as seances,
  (select count(*) from public.posts where is_club and session_id is not null) as lectures_rattachees,
  (select count(*) from public.posts where is_club and session_id is null)     as restantes;
