// Чистая логика отображения v19 (эталон vochko_pvp_enemy_defense_reveal_v19.html):
// определения «новый ли бой», кому и какие карты раскрывать, как щит съедается
// атакой и что рисовать на башнях/Нексусах. Без DOM — покрыто node --test.

// Номер показанного отчёта. У public_result нет поля round — берём его из
// report (или round-1, а для финала — round).
export function nextReportRound(rep, { finished, round }) {
  return Number(rep?.round ?? rep?.report?.[0]?.round ?? (finished ? round : Math.max(0, round - 1)));
}

// Новый бой = есть отчёт с событиями впервые показанного раунда.
// Повторные get-state/Realtime-доставки одного раунда дают false — дубли нет.
export function hasNewBattle(rep, repRound, lastReportRound) {
  return !!rep && Array.isArray(rep.events) && repRound > 0 && repRound > lastReportRound;
}

// Совместимость со старым клиентским импортом: действие отключено.
export function fortifyLaneForSubmit() { return null; }

// Этаж Нексуса принимает карты только когда обе башни линии разрушены
// и сам Нексус жив — карты не дублируются на башне и Нексусе.
export function nexusFloorOpen(board, lane) {
  return board.outer[lane] <= 0 && board.inner[lane] <= 0 && board.nexus > 0;
}

// Стадия разрушения башни для арта: full → worn → critical → ruins.
export function towerStage(hp, max) {
  if (hp <= 0) return 'ruins';
  const ratio = hp / max;
  if (ratio <= 0.35) return 'critical';
  if (ratio <= 0.7) return 'worn';
  return 'full';
}

// Порядок урона: сначала атака съедает щит (защиту), остаток снимает HP.
export function damageSplit(attack, defense) {
  const a = Math.max(0, Number(attack) || 0);
  const d = Math.max(0, Number(defense) || 0);
  return {
    absorbed: Math.min(d, a),           // поглощено защитой
    remaining: Math.max(0, d - a),      // остаток защитной шкалы
    hpDamage: Math.max(0, a - d),       // урон по HP
  };
}

// Раскрытие committed-пар по строкам серверного отчёта (это данные уже
// завершённого раунда в round_events — скрытые руки сюда не попадают).
// row.a — атака A по защите B; row.b — атака B по защите A.
// Наши башни принимают вражеские атакующие карты; на башнях врага
// раскрывается ЕГО защита в развёрнутом виде.
export function revealAssignments(report, seat) {
  const out = [];
  for (const row of report || []) {
    const lane = Number(row.lane);
    if (!Number.isInteger(lane) || lane < 0 || lane > 2) continue;
    for (const entry of [
      { combat: row.a, defenderSide: 'b' },
      { combat: row.b, defenderSide: 'a' },
    ]) {
      const isMine = (entry.defenderSide === 'a' && seat === 1) || (entry.defenderSide === 'b' && seat === 2);
      const cards = (isMine ? entry.combat?.ownPairs : entry.combat?.opponentPairs)?.flat()
        ?? (isMine ? entry.combat?.attack : entry.combat?.defense);
      if (!Array.isArray(cards) || ![2, 4].includes(cards.length)) continue;
      out.push({
        lane,
        defenderSide: entry.defenderSide,
        stage: entry.combat?.stage ?? null,
        isMine,
        cards,
        label: 'ОБЕ ПАРЫ ВРАГА',
      });
    }
  }
  return out;
}

// Щит-строки отчёта: сторона-получатель, её полная защита и сила атаки по ней.
// Защита A — это row.b.info.d, защита B — row.a.info.d.
export function shieldEntries(report) {
  const out = [];
  for (const row of report || []) {
    const lane = Number(row.lane);
    for (const entry of [
      { side: 'a', info: row.b?.info, stage: row.b?.stage },
      { side: 'b', info: row.a?.info, stage: row.a?.stage },
    ]) {
      if (!entry.info) continue;
      out.push({
        lane,
        side: entry.side,
        stage: entry.stage ?? null,
        full: Math.max(0, Number(entry.info.d) || 0),
        attack: Math.max(0, Number(entry.info.a) || 0),
        element: entry.info.dt ?? null,
        attackElement: entry.info.at ?? null,
      });
    }
  }
  return out;
}
