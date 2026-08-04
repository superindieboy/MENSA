-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Relie chaque dégustation à une fiche précise du catalogue.
--
-- Jusqu'ici le lien se faisait par le NOM du cigare. Or 61 noms du catalogue
-- désignent plusieurs formats : « Flor de Selva Clásica » couvre huit vitoles.
-- Une note portée sur l'un d'eux était donc recopiée sur les huit, y compris
-- ceux que personne n'avait fumés.
--
-- La colonne stocke l'identifiant de la fiche, qui n'est pas toujours un uuid :
-- les fiches du catalogue embarqué ont des identifiants de la forme
-- « mensa-0041 », celles créées par les membres « m-<uuid> ». D'où le type text.

alter table public.posts
  add column if not exists catalog_id text;

-- Les dégustations publiées avant cette colonne restent sans lien : elles
-- continuent d'être rattachées par le nom, mais seulement lorsqu'il ne désigne
-- qu'une fiche. Rouvrir une ancienne dégustation et l'enregistrer suffit à la
-- relier à un format précis.

-- Vérification : doit renvoyer une ligne « catalog_id | text ».
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'posts' and column_name = 'catalog_id';
