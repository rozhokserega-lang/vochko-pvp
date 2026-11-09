-- ВОЧКО PvP 2.0 — схема приватного матча (этап B).
-- Схема private не открывается через PostgREST Data API; доступ только у
-- Edge Functions через service-role подключение к Postgres.

create schema if not exists private;

create table if not exists private.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting','planning','resolving','finished')),
  round int not null default 1,
  version bigint not null default 1,
  player1_id uuid not null,
  player2_id uuid,
  -- Закрытое состояние: руки, доски, флаги укреплений. НЕ публиковать целиком.
  state jsonb not null default '{}'::jsonb,
  winner_seat int check (winner_seat in (1,2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table if not exists private.turns (
  match_id uuid not null references private.matches(id) on delete cascade,
  round int not null,
  player_id uuid not null,
  seat int not null check (seat in (1,2)),
  placements jsonb not null,
  fortify_lane int,
  submitted_at timestamptz not null default now(),
  primary key (match_id, round, player_id)
);

create table if not exists private.round_events (
  match_id uuid not null references private.matches(id) on delete cascade,
  round int not null,
  public_result jsonb not null,
  created_at timestamptz not null default now(),
  unique (match_id, round)
);

create index if not exists matches_room_code on private.matches(room_code);
create index if not exists matches_expires_at on private.matches(expires_at);
create index if not exists turns_match_round on private.turns(match_id, round);

-- RLS без единой политики = запрет всего для anon/authenticated.
alter table private.matches enable row level security;
alter table private.turns enable row level security;
alter table private.round_events enable row level security;

-- Двойная защита: private-схема не выдаётся через Data API, но revoke явный.
revoke all on all tables in schema private from anon;
revoke all on all tables in schema private from authenticated;
revoke all on all functions in schema private from anon;
revoke all on all functions in schema private from authenticated;
revoke usage on schema private from anon;
revoke usage on schema private from authenticated;
