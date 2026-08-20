-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Les badges décernés aux membres.
--
-- Une distinction n'a de valeur que si elle vient de quelqu'un : ces badges
-- ne s'obtiennent pas par un compteur, ils se décernent. Seul le modérateur
-- les attribue et les retire ; tout le cercle les voit, c'est le but.

create table if not exists public.member_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  label      text not null check (length(trim(label)) between 1 and 40),
  emoji      text check (length(emoji) <= 8),
  awarded_by uuid not null references auth.users on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, label)          -- deux fois le même badge n'ajoute rien
);

create index if not exists member_badges_user_idx on public.member_badges (user_id);

alter table public.member_badges enable row level security;

drop policy if exists "badges_lecture"      on public.member_badges;
drop policy if exists "badges_insert_admin" on public.member_badges;
drop policy if exists "badges_update_admin" on public.member_badges;
drop policy if exists "badges_delete_admin" on public.member_badges;

-- Lisibles par tout le cercle : un badge que personne ne voit n'existe pas.
create policy "badges_lecture" on public.member_badges
  for select to authenticated using (true);

-- Décernés par le seul modérateur.
create policy "badges_insert_admin" on public.member_badges
  for insert to authenticated with check (public.est_admin());

create policy "badges_update_admin" on public.member_badges
  for update to authenticated using (public.est_admin());

create policy "badges_delete_admin" on public.member_badges
  for delete to authenticated using (public.est_admin());

-- Vérification : la table répond, et elle est vide au départ.
select count(*) as badges from public.member_badges;
