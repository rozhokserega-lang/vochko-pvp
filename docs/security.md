# Security

## Модель

- **Аутентификация:** Supabase Auth anonymous sign-in; JWT клиента проверяется
  в каждой функции (`requireUser`). Никаких пользовательских id в теле запроса.
- **Авторизация:** участие в матче = `auth.uid() ∈ {player1_id, player2_id}`;
  иначе 403. Третий игрок в комнату не попадает (атомарный UPDATE по условию).
- **Схема:** вся приватность в `private` (не публикуется Data API) + RLS без
  политик + явные REVOKE для anon/authenticated.
- **Движок:** расчёт только на сервере (Edge Function + `shared/engine.js` в
  той же транзакции). Клиент не считает HP и не отправляет числа.

## Гонки и идемпотентность

- `submit-turn`: `SELECT ... FOR UPDATE` на строку матча; второе из двух
  подтверждений инициирует ровно один resolve внутри `sql.begin`.
- Повторный submit → прежнее подтверждение, HP не меняется.
- Replay старого `round`/`expectedVersion` → 409.

## Каналы

- Realtime Broadcast: только `{matchId, version, eventType}`. Никакого
  таблицного CDC (`private`-схема не в публикации, строки утекли бы руки).
- Ключи: publishable — в клиенте; service_role и строка БД — только в
  Supabase Secrets (`SUPABASE_DB_URL`). Не логировать тела рук.

## Секреты

```
supabase secrets set SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

## Чек-лист теста безопасности (этап F)

- [ ] submit чужих карт → 400; дублей → 400; чёрных в атаке → 400.
- [ ] get-state посторонним → 403; в ответе нет opponent.hand до resolve.
- [ ] Два одновременных submit-turn → один resolve (events одинаковые).
- [ ] Replay submit → тот же ответ, HP без изменений.
- [ ] В broadcast-пейлоаде нет карт.
