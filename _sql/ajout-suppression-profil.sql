-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- Autorise chaque membre à supprimer SA PROPRE ligne de profil,
-- nécessaire pour le bouton "Supprimer mon compte".

create policy "profiles_delete_self"
  on public.profiles
  for delete
  using (auth.uid() = id);
