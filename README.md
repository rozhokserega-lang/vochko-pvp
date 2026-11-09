# ВОЧКО PvP 2.0 — «Три линии» онлайн

Приватные матчи 1×1 по ссылке: GitHub Pages (статика) + Supabase (авторитетный сервер).
Правила v1.5 перенесены 1:1 из `legacy_v15.html` — движок в `src/game/` покрыт тестами,
включая property-тест на совпадение с легаси-кодом.

## Запуск тестов

```
node --test tests/engine.test.js
```

## Структура

```
src/game/    cards.js · combos.js · elements.js · engine.js · validation.js · rng.js
tests/       engine.test.js (+ legacy-reference.js — эталонный порт легаси)
supabase/    (этап B) миграции, Edge Functions
src/ui/      (этап D) интерфейс v1.5
docs/        architecture · rules · api · security · deployment (ADR)
```

## Этапы (README пакета §8)

- [x] **A** — перенос движка + тесты (18/18, property ≡ легаси)
- [x] **B** — Supabase: схема, RLS, Edge Functions (6 шт., все ACTIVE)
- [x] **C** — онлайн-раунд: submit-turn, атомарный resolve, realtime, реконнект-состояние —
      проверено живым прогоном: две анонимные сессии, resolve раунда, отчёт, утечек рук нет
- [x] **D** — интерфейс v1.5 (лобби, башни, drag&drop, предпросмотр, отчёт, цифры урона, реванш)
- [x] **E** — GitHub Pages: https://rozhokserega-lang.github.io/vochko-pvp/ (Actions, секреты в repo secrets)
- [ ] **F** — реальный тест на двух устройствах (за игроками)

## ADR (зафиксированные решения)

- ADR-1: таймаут неактивного матча — 24 ч (крон удаляет/закрывает).
- ADR-2: уход игрока — пауза; реконнект 10 минут, затем соперник может зафиксировать победу.
- ADR-3: Realtime публикует только `{matchId, version, eventType}`; состояние — по `get-state` с JWT.
- ADR-4: очистка завершённых матчей через 7 дней.
- ADR-5: симметричное укрепление: атака обеих сторон ×0.85 (округление), затем защита ×1.25 (округление), hit пересчитывается один раз — при одиночном укреплении эквивалентно легаси.
