-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Ajoute la colonne permettant de marquer une dégustation comme
-- publiée également dans la section "Par le club" (case à cocher,
-- réservée au compte admin dans l'app).

alter table public.posts
  add column if not exists is_club boolean not null default false;
