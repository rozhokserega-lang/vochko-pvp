# API — контракт v0.1

Все операции — POST на `<SUPABASE_URL>/functions/v1/<name>` с заголовком
`Authorization: Bearer <anon-сессия JWT>` (Supabase Auth anonymous sign-in).
Identity берётся из JWT на сервере; тело запроса идентификации не содержит.

| Операция | Запрос | Ответ |
|---|---|---|
| `create-room` | `{}` | `{matchId, roomCode, seat:1}` |
| `join-room` | `{roomCode}` | `{matchId, seat:2}` · 409 если комната полна/не найдена |
| `get-state` | `{matchId}` | персональный `PlayerView` |
| `submit-turn` | `{matchId, round, expectedVersion, placements, fortifyLane}` | `{accepted, version, ready, resolved?, events?, winner?}` |
| `rematch` | `{matchId}` | `{waiting:true}` либо `{waiting:false, matchId, roomCode}` |
| `leave-room` | `{matchId}` | `{ok:true}` |

## placements

Массив ровно из 3 элементов: `{lane:0|1|2, attack:[cardId,cardId], defense:[cardId,cardId]}`.
Каждая карта — id-строка (`"♥10"`) из собственной руки, без повторов.
`attack` и `defense` — сохранённые имена **первой и второй универсальных пар**;
каждая пара любой масти даёт и атаку, и защиту. `fortifyLane` только `null` или отсутствует.
Другие поля действия/характеристик, лишние пары и объекты карт отклоняются с HTTP 400.
Сервер материализует карты из своей руки и вычисляет все числа самостоятельно.

## PlayerView

```
{ matchId, roomCode, seat, status, round, version,
  me: { hand, ready, fortifyUsed },
  opponent: { connected, ready, fortifyUsed },     // без руки и раскладки!
  board: { me: <board+burn>, opponent: { nexus, outer, inner, shieldPct } },
  latestRoundReport, winner: null|"me"|"opponent"|"draw", canRematch }
```

## Порядок раунда (README §6)

1. `join-room` — сервер раздаёт обе руки (крипто-RNG), статус `planning`.
2. Локальная раскладка; `submit-turn` — валидация, идемпотентный insert.
3. Второе подтверждение → одна транзакция: `FOR UPDATE` → resolve обеих пар
   → HP → `round_events` → новые руки → `version+1` → commit.
4. Realtime-событие `{matchId, version, eventType}` → клиенты зовут `get-state`.
5. Повторный submit возвращает прежнее подтверждение (idempotency).

`fortifyUsed` всегда false. `burn` обнуляется, урон от него не применяется.
В строках `latestRoundReport.report` поля `a`/`b` описывают атаку соответствующей стороны:
`info.a` — её суммарная атака, `info.d` — защита соперника; `dealt` — нанесённый ею урон.
`ownPairs`/`opponentPairs` содержат обе пары; `info.pairs`/`info.opponentPairs` — их серверные расчёты.
Старые `attack`/`defense` сохранены для совместимости визуализации.
