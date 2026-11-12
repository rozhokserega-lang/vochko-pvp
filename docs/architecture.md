# Architecture

```
GitHub Pages (статика Vite; vanilla JS)
  └─ supabase-js: Auth anonymous → JWT
      ├─ Edge Functions (Deno): create-room · join-room · get-state ·
      │                         submit-turn · rematch · leave-room
      │    └─ postgres-js (service-role) → private.matches/turns/round_events
      │    └─ shared/engine.js — ЕДИНСТВЕННАЯ реализация правил
      └─ Realtime Broadcast: {matchId, version, eventType} → клиент делает get-state
```

## Принципы

1. **Один источник правил**: `shared/engine.js` импортируют и клиент (только
   предпросмотры: `combos/elements`), и Edge Functions (resolve). Копий математики нет.
2. **Клиент шлёт намерения** (id карт + позиции), сервер валидирует и считает.
3. **Персональный DTO**: `get-state` собирает view по JWT; руки соперника до
   resolve не существуют в публичных ответах и broadcast-пейлоадах.
4. **Атомарность раунда**: `SELECT ... FOR UPDATE` + подсчёт подтверждений
   внутри одной транзакции → resolve выполняется ровно один раз.
5. **Реконнект**: состояние полностью в БД (`matches.state` + `turns` +
   `round_events`); клиент перезапросом `get-state` восстанавливает экран.

## Стихийные способности и AI (feature/elemental-ai)

```
shared/abilities.js  — таблица 20 способностей, статусы (1 раунд, капы),
                       направленная таблица контрстихий (эффекты выключены)
shared/engine.js     — resolveRound(state, a, b, {abilities, rng, disabled});
                       abilities=false ≡ прежний движок (инварианс-тест)
shared/bot.js        — legacy botPlan (DP) + smart-бот: beam-раскладки →
                       Monte Carlo сэмплов рук соперника → тот же resolveRound
supabase submit-turn — state.rules {abilities, smartBot} + rngSeed в state →
                       воспроизводимый seeded resolve; отчёт хранит abilityEvents
UI                   — StatusBadges.js (статусы на башнях) + AbilityFeed.js
                       (лента срабатываний в хореографии)
```

Бот не получает скрытую руку соперника: только доски и свои карты; возможные
руки противника генерируются по правилам раздачи (`shared/cards.deal`).

## Таблицы (private)

- `matches` — матрь, статус, round, version (оптимистичная блокировка), state jsonb.
- `turns` — закрытые ходы; UNIQUE(match,round,player) = идемпотентность.
- `round_events` — публичный отчёт раунда (для разбора и реконнекта).

См. `api.md` (контракт), `security.md` (модель угроз), `rules.md` (правила), `deployment.md`.
