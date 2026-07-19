-- =====================================================================
--  MENSA — Schéma Supabase (données partagées entre membres)
--  À coller dans Supabase → SQL Editor → New query → Run.
--  Inscription ouverte à tous. Lecture commune, écriture limitée à l'auteur.
-- =====================================================================

-- ---------- TABLES ----------

-- Profils (1 ligne par compte, créée automatiquement à l'inscription)
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  bio        text default '',
  email      text,
  created_at timestamptz default now()
);

-- Dégustations (le fil)
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  cigar_name text not null,
  origin     text,
  terroir    text,                  -- code visuel : cuba | nica | rep | hon
  rating     numeric,
  t1         numeric,
  t2         numeric,
  t3         numeric,
  note       text,
  flavors    text[] default '{}',
  place      text default '',
  created_at timestamptz default now()
);

-- Cave commune du club
create table if not exists public.cave_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  detail     text,
  terroir    text,                  -- cuba | nica | rep | hon
  qty        int default 1,
  added      date default current_date,
  created_at timestamptz default now()
);

-- "J'aime" sur les dégustations (1 par membre et par post)
create table if not exists public.post_likes (
  post_id    uuid references public.posts on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- ---------- CRÉATION AUTO DU PROFIL À L'INSCRIPTION ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- SÉCURITÉ (Row Level Security) ----------
-- Tout membre CONNECTÉ peut lire les données du club.
-- Chacun ne peut écrire / modifier / supprimer QUE ses propres entrées.

alter table public.profiles   enable row level security;
alter table public.posts      enable row level security;
alter table public.cave_items enable row level security;
alter table public.post_likes enable row level security;

-- PROFILES
create policy "profiles_read"        on public.profiles   for select using (auth.uid() is not null);
create policy "profiles_insert_self" on public.profiles   for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles   for update using (auth.uid() = id);
create policy "profiles_delete_self" on public.profiles   for delete using (auth.uid() = id);

-- POSTS
create policy "posts_read"        on public.posts      for select using (auth.uid() is not null);
create policy "posts_insert_own"  on public.posts      for insert with check (auth.uid() = user_id);
create policy "posts_update_own"  on public.posts      for update using (auth.uid() = user_id);
create policy "posts_delete_own"  on public.posts      for delete using (auth.uid() = user_id);

-- CAVE
create policy "cave_read"         on public.cave_items for select using (auth.uid() is not null);
create policy "cave_insert_own"   on public.cave_items for insert with check (auth.uid() = user_id);
create policy "cave_update_own"   on public.cave_items for update using (auth.uid() = user_id);
create policy "cave_delete_own"   on public.cave_items for delete using (auth.uid() = user_id);

-- LIKES
create policy "likes_read"        on public.post_likes for select using (auth.uid() is not null);
create policy "likes_insert_own"  on public.post_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete_own"  on public.post_likes for delete using (auth.uid() = user_id);

-- =====================================================================
--  Terminé. Pensez ensuite à désactiver la confirmation par email
--  (Authentication → Providers → Email → "Confirm email" : OFF)
--  pour que l'inscription connecte immédiatement les bêta-testeurs.
-- =====================================================================
