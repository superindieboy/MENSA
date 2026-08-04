-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Photos de bagues sur les dégustations.
-- Les images vivent dans Supabase Storage, la table ne garde que leur adresse.

alter table public.posts
  add column if not exists photo_url text;

-- Espace de stockage public en lecture : les photos s'affichent dans le fil
-- sans authentifier chaque requête d'image.
insert into storage.buckets (id, name, public)
values ('bagues', 'bagues', true)
on conflict (id) do update set public = true;

-- Chaque membre dépose dans un dossier à son identifiant, et ne peut
-- ni écraser ni supprimer les photos des autres.

drop policy if exists "bagues_lecture" on storage.objects;
create policy "bagues_lecture"
  on storage.objects for select
  using (bucket_id = 'bagues');

drop policy if exists "bagues_depot_own" on storage.objects;
create policy "bagues_depot_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'bagues' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "bagues_suppression_own" on storage.objects;
create policy "bagues_suppression_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'bagues' and (storage.foldername(name))[1] = auth.uid()::text);

-- Vérification : l'espace doit exister et être public, avec ses trois règles.
select id, public from storage.buckets where id = 'bagues';
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'bagues%'
order by policyname;
