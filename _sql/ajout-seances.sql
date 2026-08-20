-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Les séances : plusieurs membres fument le même cigare, et l'app confronte
-- leurs lectures tiers par tiers.
--
-- C'est ce qui distingue un cercle d'un carnet partagé. Une séance n'est
-- qu'un point de rendez-vous : elle ne contient aucune note. Chacun publie sa
-- dégustation comme d'habitude, en la rattachant à la séance — d'où la simple
-- colonne session_id sur posts plutôt qu'une table de participants.

create table if not exists public.tasting_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,   -- l'organisateur
  cigar_name text not null,
  catalog_id text,                   -- fiche du cigare : « mensa-0041 » ou « m-<uuid> »
  terroir    text,
  held_on    date not null,
  place      text,
  created_at timestamptz default now()
);

create index if not exists sessions_date_idx on public.tasting_sessions (held_on desc);

-- Le lien côté dégustation. « on delete set null » : supprimer une séance ne
-- doit jamais emporter les dégustations que les membres y ont publiées.
alter table public.posts
  add column if not exists session_id uuid references public.tasting_sessions(id) on delete set null;

create index if not exists posts_session_idx on public.posts (session_id);

alter table public.tasting_sessions enable row level security;

drop policy if exists "seances_lecture"      on public.tasting_sessions;
drop policy if exists "seances_insert_own"   on public.tasting_sessions;
drop policy if exists "seances_update_own"   on public.tasting_sessions;
drop policy if exists "seances_delete_own"   on public.tasting_sessions;
drop policy if exists "seances_insert_admin" on public.tasting_sessions;
drop policy if exists "seances_update_admin" on public.tasting_sessions;
drop policy if exists "seances_delete_admin" on public.tasting_sessions;

-- Une séance est une invitation : tout le cercle la voit.
create policy "seances_lecture"    on public.tasting_sessions
  for select to authenticated using (true);

-- Convier le cercle revient au seul modérateur. Publier sa lecture reste
-- ouvert à tous : c'est la colonne posts.session_id, régie par les policies
-- de posts, et non par celles-ci.
create policy "seances_insert_admin" on public.tasting_sessions
  for insert to authenticated
  with check (public.est_admin() and auth.uid() = user_id);
create policy "seances_update_admin" on public.tasting_sessions
  for update to authenticated using (public.est_admin());
create policy "seances_delete_admin" on public.tasting_sessions
  for delete to authenticated using (public.est_admin());

-- Vérification : la table répond, et posts porte bien sa colonne.
select
  (select count(*) from public.tasting_sessions) as seances,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='posts' and column_name='session_id') as colonne_posts;
