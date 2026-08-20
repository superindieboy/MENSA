-- À exécuter dans Supabase → SQL Editor.
-- Réexécutable sans risque.
--
-- Prix partagés entre membres, sans contournement de sécurité.
--
-- Remplace la vue cave_prices, qui bypassait la RLS de cave_items et que
-- Supabase signalait à juste titre (Security Definer View). Ici, les caves
-- restent intégralement privées : enregistrer un lot avec un prix publie en
-- parallèle une ligne anonyme dans price_reports, qui a ses propres règles.
--
-- L'anonymat ne repose pas sur l'absence de la colonne user_id — elle est
-- nécessaire pour restreindre l'écriture — mais sur des privilèges PAR COLONNE :
-- les membres peuvent lire le prix, jamais son auteur.

create table if not exists public.price_reports (
  cave_item_id uuid primary key references public.cave_items(id) on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  name         text not null,
  terroir      text,
  price        numeric(10,2) not null,
  bought_in    text,
  added        date,
  created_at   timestamptz default now()
);

-- La clé étrangère en cascade supprime le prix publié quand le lot disparaît :
-- aucune synchronisation à maintenir côté application pour la suppression.

alter table public.price_reports enable row level security;

drop policy if exists "prix_lecture"     on public.price_reports;
drop policy if exists "prix_insert_own"  on public.price_reports;
drop policy if exists "prix_update_own"  on public.price_reports;
drop policy if exists "prix_delete_own"  on public.price_reports;

create policy "prix_lecture"    on public.price_reports for select to authenticated using (true);
create policy "prix_insert_own" on public.price_reports for insert to authenticated with check (auth.uid() = user_id);
create policy "prix_update_own" on public.price_reports for update to authenticated using (auth.uid() = user_id);
create policy "prix_delete_own" on public.price_reports for delete to authenticated using (auth.uid() = user_id);

-- Privilèges par colonne : c'est ce qui rend le prix anonyme.
-- user_id reste inaccessible en lecture, tout en servant aux règles ci-dessus.
revoke all on public.price_reports from anon, authenticated;
grant select (cave_item_id, name, terroir, price, bought_in, added) on public.price_reports to authenticated;
grant insert (cave_item_id, user_id, name, terroir, price, bought_in, added) on public.price_reports to authenticated;
grant update (name, terroir, price, bought_in, added)                on public.price_reports to authenticated;
grant delete on public.price_reports to authenticated;

-- Reprise des prix déjà saisis dans les caves.
insert into public.price_reports (cave_item_id, user_id, name, terroir, price, bought_in, added)
select id, user_id, name, terroir, price, bought_in, added
from public.cave_items
where price is not null
on conflict (cave_item_id) do nothing;

-- La vue n'a plus lieu d'être : c'est elle que Supabase signalait.
drop view if exists public.cave_prices;

-- Vérification : les prix repris, sans colonne identifiante lisible.
select cave_item_id, name, price, bought_in, added from public.price_reports limit 5;
