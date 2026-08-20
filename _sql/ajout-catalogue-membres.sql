-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Permet aux membres d'ajouter une fiche cigare absente du catalogue
-- embarqué, depuis le formulaire de dégustation.

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
  created_at timestamptz default now()
);

alter table public.catalog_items enable row level security;

create policy "catalog_read"       on public.catalog_items for select using (auth.uid() is not null);
create policy "catalog_insert_own" on public.catalog_items for insert with check (auth.uid() = user_id);
create policy "catalog_update_own" on public.catalog_items for update using (auth.uid() = user_id);
create policy "catalog_delete_own" on public.catalog_items for delete using (auth.uid() = user_id);
