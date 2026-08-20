-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque, SAUF la dernière ligne, à compléter par vos soins.
--
-- Le modérateur cesse d'être une adresse écrite dans le code.
--
-- Jusqu'ici, savoir qui modère demandait de comparer une adresse : dans les
-- policies, et dans index.html. Or index.html est servi publiquement — le
-- domaine sert tout le dépôt — si bien que cette adresse s'y lisait, et
-- pouvait un jour se retrouver indexée.
--
-- Elle devient une donnée : une ligne dans une table. Le code ne nomme plus
-- personne, ni côté serveur ni côté client, et changer de modérateur ne
-- demande plus de redéployer quoi que ce soit.

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins_lecture" on public.admins;

-- Tout membre peut savoir qui modère : ce n'est pas un secret, et l'app a
-- besoin de la réponse pour elle-même. Aucune policy d'écriture n'existe :
-- on ne se nomme pas modérateur depuis l'application, seulement d'ici.
create policy "admins_lecture" on public.admins
  for select to authenticated using (true);

-- La question que pose l'app, et que posent toutes les policies ci-dessous.
-- « stable » : le résultat ne change pas au cours d'une même requête.
create or replace function public.est_admin()
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

grant execute on function public.est_admin() to authenticated;

-- ---------- LES POLICIES CESSENT DE CITER UNE ADRESSE ----------

-- Catalogue : le modérateur corrige la fiche de n'importe qui.
-- Les noms sont ceux du schéma : « catalog », non « catalogue ». Un drop qui
-- se trompe de nom ne trouve rien, et laisse vivre l'ancienne règle.
drop policy if exists "catalog_update_admin" on public.catalog_items;
drop policy if exists "catalog_delete_admin" on public.catalog_items;
drop policy if exists "catalogue_update_admin" on public.catalog_items;
drop policy if exists "catalogue_delete_admin" on public.catalog_items;
create policy "catalog_update_admin" on public.catalog_items
  for update to authenticated using (public.est_admin());
create policy "catalog_delete_admin" on public.catalog_items
  for delete to authenticated using (public.est_admin());

-- Dégustations : le modérateur retire ce qui n'a pas sa place.
drop policy if exists "posts_delete_admin" on public.posts;
drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_delete_admin" on public.posts
  for delete to authenticated using (public.est_admin());
-- renommer une fiche réécrit le nom du cigare sur les dégustations d'autrui :
-- la modération a besoin d'écrire au-delà de ses propres lignes
create policy "posts_update_admin" on public.posts
  for update to authenticated using (public.est_admin());

-- Commentaires : idem.
drop policy if exists "commentaires_delete_admin" on public.post_comments;
create policy "commentaires_delete_admin" on public.post_comments
  for delete to authenticated using (public.est_admin());

-- Badges : une distinction se décerne, elle ne se prend pas.
-- « badges_update_admin » ne se recrée pas : rien ne modifie un badge, on en
-- pose et on en retire.
drop policy if exists "badges_update_admin" on public.member_badges;
drop policy if exists "badges_insert_admin" on public.member_badges;
drop policy if exists "badges_delete_admin" on public.member_badges;
create policy "badges_insert_admin" on public.member_badges
  for insert to authenticated with check (public.est_admin() and auth.uid() = awarded_by);
create policy "badges_delete_admin" on public.member_badges
  for delete to authenticated using (public.est_admin());

-- Séances : convier le cercle revient au seul modérateur.
drop policy if exists "seances_insert_admin" on public.tasting_sessions;
drop policy if exists "seances_update_admin" on public.tasting_sessions;
drop policy if exists "seances_delete_admin" on public.tasting_sessions;
create policy "seances_insert_admin" on public.tasting_sessions
  for insert to authenticated with check (public.est_admin() and auth.uid() = user_id);
create policy "seances_update_admin" on public.tasting_sessions
  for update to authenticated using (public.est_admin());
create policy "seances_delete_admin" on public.tasting_sessions
  for delete to authenticated using (public.est_admin());

-- ---------- À COMPLÉTER : DÉSIGNEZ-VOUS ----------
-- Remplacez l'adresse ci-dessous par la vôtre. Cette ligne ne part pas au
-- dépôt : elle ne vit que dans cette fenêtre.

-- insert into public.admins (user_id)
-- select id from auth.users where email = 'votre.adresse@exemple.fr'
-- on conflict (user_id) do nothing;

-- Vérification : le compte des modérateurs, et la réponse pour vous.
select (select count(*) from public.admins) as moderateurs,
       public.est_admin() as je_suis_moderateur;
