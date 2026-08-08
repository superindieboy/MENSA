-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- La liste d'envies : les cigares qu'un membre veut goûter.
--
-- Privée comme la cave, et pour la même raison : ce qu'on convoite regarde
-- son auteur. Aucune policy administrateur ici — le modérateur n'a rien à
-- faire dans les envies des autres.

create table if not exists public.wishlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  detail     text,                  -- module / vitole
  terroir    text,                  -- cuba | nica | rep | hon | cr | mex | bre | autre
  note       text,                  -- pourquoi on le veut
  added      date default current_date,
  created_at timestamptz default now()
);

create index if not exists wishlist_user_idx on public.wishlist_items (user_id, created_at);

alter table public.wishlist_items enable row level security;

drop policy if exists "wishlist_read_own"   on public.wishlist_items;
drop policy if exists "wishlist_insert_own" on public.wishlist_items;
drop policy if exists "wishlist_update_own" on public.wishlist_items;
drop policy if exists "wishlist_delete_own" on public.wishlist_items;

create policy "wishlist_read_own"   on public.wishlist_items for select using (auth.uid() = user_id);
create policy "wishlist_insert_own" on public.wishlist_items for insert with check (auth.uid() = user_id);
create policy "wishlist_update_own" on public.wishlist_items for update using (auth.uid() = user_id);
create policy "wishlist_delete_own" on public.wishlist_items for delete using (auth.uid() = user_id);

-- Vérification : quatre policies, toutes limitées à auth.uid() = user_id.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'wishlist_items'
order by cmd, policyname;
