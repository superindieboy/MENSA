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
  is_club    boolean not null default false,  -- affiché aussi dans "Par le club" (réservé au compte admin)
  catalog_id text,                            -- fiche notée : « mensa-0041 » (embarquée) ou « m-<uuid> » (membre)
  photo_url  text,                            -- photo de la bague, déposée dans l'espace de stockage « bagues »
  created_at timestamptz default now()
);

-- Cave personnelle de chaque membre (privée : lui seul y accède).
-- Une ligne = un LOT d'achat : le même cigare racheté plus tard, ailleurs ou
-- à un autre prix forme une seconde ligne. L'app les regroupe à l'affichage.
create table if not exists public.cave_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  detail     text,
  terroir    text,                  -- cuba | nica | rep | hon
  qty        int default 1,
  price      numeric(10,2),          -- prix payé, à l'unité et en euros
  bought_in  text,                   -- pays d'achat, distinct du terroir du cigare
  added      date default current_date,
  created_at timestamptz default now()
);

-- Fiches cigare ajoutées par les membres (complète le catalogue embarqué)
create table if not exists public.catalog_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  brand      text default '',
  vitola     text default '',
  module     text default '',
  country    text default '',
  terroir    text,
  length     int,
  ring       int,
  wrapper    text default '',
  binder     text default '',
  filler     text default '',
  strength   int,
  replaces   text,                   -- id de la fiche embarquée corrigée (ex. mensa-0002)
  created_at timestamptz default now()
);

-- "J'aime" sur les dégustations (1 par membre et par post)
create table if not exists public.post_likes (
  post_id    uuid references public.posts on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Commentaires sous une dégustation : ce qui distingue le club du carnet
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz default now()
);
create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

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

alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.cave_items    enable row level security;
alter table public.catalog_items enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

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
create policy "cave_read_own"     on public.cave_items for select using (auth.uid() = user_id);
create policy "cave_insert_own"   on public.cave_items for insert with check (auth.uid() = user_id);
create policy "cave_update_own"   on public.cave_items for update using (auth.uid() = user_id);
create policy "cave_delete_own"   on public.cave_items for delete using (auth.uid() = user_id);

-- CATALOGUE (fiches ajoutées par les membres, lisibles par tous)
create policy "catalog_read"       on public.catalog_items for select using (auth.uid() is not null);
create policy "catalog_insert_own" on public.catalog_items for insert with check (auth.uid() = user_id);
create policy "catalog_update_own" on public.catalog_items for update using (auth.uid() = user_id);
create policy "catalog_delete_own" on public.catalog_items for delete using (auth.uid() = user_id);

-- LIKES
create policy "likes_read"        on public.post_likes for select using (auth.uid() is not null);
create policy "likes_insert_own"  on public.post_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete_own"  on public.post_likes for delete using (auth.uid() = user_id);

-- COMMENTAIRES
-- L'auteur maîtrise son commentaire ; l'auteur de la dégustation maîtrise ce
-- qui s'écrit sous elle. D'où deux règles de suppression au lieu d'une.
create policy "commentaires_lecture"    on public.post_comments for select to authenticated using (true);
create policy "commentaires_insert_own" on public.post_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "commentaires_update_own" on public.post_comments for update to authenticated using (auth.uid() = user_id);
create policy "commentaires_delete_own" on public.post_comments for delete to authenticated using (auth.uid() = user_id);
create policy "commentaires_delete_hote" on public.post_comments for delete to authenticated using (
  exists (select 1 from public.posts p where p.id = post_comments.post_id and p.user_id = auth.uid())
);

-- ---------- ADMINISTRATEUR ----------
-- Modération des publications, et correction de n'importe quelle fiche du
-- catalogue. Le renommage d'une fiche se répercute sur les dégustations de
-- tous les membres : d'où le droit d'update au-delà de ses propres lignes.
-- Les caves restent privées : aucune policy admin ne les couvre.

create policy "posts_delete_admin"    on public.posts         for delete using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
create policy "posts_update_admin"    on public.posts         for update using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
create policy "catalog_update_admin"  on public.catalog_items for update using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
create policy "catalog_delete_admin"  on public.catalog_items for delete using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');
create policy "commentaires_delete_admin" on public.post_comments for delete using ((auth.jwt() ->> 'email') = 'hippolyte.sable@gmail.com');

-- =====================================================================
--  Terminé. Pensez ensuite à désactiver la confirmation par email
--  (Authentication → Providers → Email → "Confirm email" : OFF)
--  pour que l'inscription connecte immédiatement les bêta-testeurs.
-- =====================================================================
