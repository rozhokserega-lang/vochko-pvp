-- Обслуживание: истечение неактивных матчей (ADR-1: 24 ч; ADR-2: уход = сокращение окна до 10 мин).

create or replace function private.expire_old_matches()
returns void
language sql
security definer
set search_path = private
as $$
  update private.matches
     set status = 'finished'
   where status <> 'finished'
     and expires_at < now();
$$;

-- Плановая очистка через pg_cron (если расширение доступно в проекте).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'pvp-expire-matches',
    '17 * * * *',
    $$select private.expire_old_matches();$$
  );
exception when others then
  -- pg_cron недоступен: очистка выполняется вручную или через периодический
  -- вызов private.expire_old_matches() (например, из get-state).
  raise notice 'pg_cron not available, schedule manually';
end $$;

-- Удаление завершённых матчей старше 7 дней (ADR-4).
create or replace function private.purge_finished_matches()
returns void
language sql
security definer
set search_path = private
as $$
  delete from private.matches
   where status = 'finished'
     and updated_at < now() - interval '7 days';
$$;
