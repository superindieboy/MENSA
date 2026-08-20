-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Les commentaires sous une dégustation.
--
-- Le cercle n'avait que le cœur pour tout échange. Or une dégustation appelle
-- une réponse — « laisse-le vieillir encore un an », « le mien tirait mal » —
-- et c'est cette conversation qui distingue un club d'un carnet personnel.
--
-- Un commentaire appartient à son auteur : lui seul le modifie. Il peut le
-- supprimer, tout comme l'auteur de la dégustation et le modérateur.

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz default now()
);

-- Le panneau d'une dégustation lit les commentaires d'un seul post, dans l'ordre.
create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists "commentaires_lecture"      on public.post_comments;
drop policy if exists "commentaires_insert_own"   on public.post_comments;
drop policy if exists "commentaires_update_own"   on public.post_comments;
drop policy if exists "commentaires_delete_own"   on public.post_comments;
drop policy if exists "commentaires_delete_hote"  on public.post_comments;
drop policy if exists "commentaires_delete_admin" on public.post_comments;

create policy "commentaires_lecture"    on public.post_comments
  for select to authenticated using (true);

create policy "commentaires_insert_own" on public.post_comments
  for insert to authenticated with check (auth.uid() = user_id);

create policy "commentaires_update_own" on public.post_comments
  for update to authenticated using (auth.uid() = user_id);

create policy "commentaires_delete_own" on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);

-- L'auteur de la dégustation reste maître de ce qui s'écrit sous elle.
create policy "commentaires_delete_hote" on public.post_comments
  for delete to authenticated using (
    exists (select 1 from public.posts p
             where p.id = post_comments.post_id and p.user_id = auth.uid())
  );

create policy "commentaires_delete_admin" on public.post_comments
  for delete to authenticated using (public.est_admin());

-- Vérification : la table répond et elle est vide au départ.
select count(*) as commentaires from public.post_comments;
