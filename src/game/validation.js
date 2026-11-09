// Валидация хода — чистые функции для сервера (Edge Function). Карты передаются
// только идентификаторами; любые числа от клиента (урон/HP) игнорируются по контракту.
const RED = (s) => s === '♥' || s === '♦';
const BLACK = (s) => s === '♠' || s === '♣';

// turn = { placements: [{lane, attack:[id,id], defense:[id,id]}×3], fortifyLane: null|0|1|2 }
// hand = массив карт вида { id, s, r, v } (персональная раздача игрока).
export function validateTurn(hand, turn) {
  if (!turn || !Array.isArray(turn.placements) || turn.placements.length !== 3)
    return { ok: false, error: 'Нужно ровно 3 линии' };
  const lanes = turn.placements.map((p) => p && p.lane).sort();
  if (JSON.stringify(lanes) !== JSON.stringify([0, 1, 2]))
    return { ok: false, error: 'Линии должны быть 0, 1, 2 без повторов' };
  const byId = new Map(hand.map((c) => [c.id, c]));
  const seen = new Set();
  for (const p of turn.placements) {
    if (!Array.isArray(p.attack) || !Array.isArray(p.defense) || p.attack.length !== 2 || p.defense.length !== 2)
      return { ok: false, error: 'В каждой линии ровно 2 атаки и 2 защиты' };
    for (const id of [...p.attack, ...p.defense]) {
      if (seen.has(id)) return { ok: false, error: 'Карта использована дважды: ' + id };
      seen.add(id);
      const card = byId.get(id);
      if (!card) return { ok: false, error: 'Карты нет в руке: ' + id };
    }
    for (const id of p.attack) if (!RED(byId.get(id).s)) return { ok: false, error: 'Атака только красными ♥♦' };
    for (const id of p.defense) if (!BLACK(byId.get(id).s)) return { ok: false, error: 'Защита только чёрными ♠♣' };
    const atk = p.attack.map((id) => byId.get(id));
    const def = p.defense.map((id) => byId.get(id));
    if (!(RED(atk[0].s) && RED(atk[1].s))) return { ok: false, error: 'Пара атаки одного цвета' };
    if (!(BLACK(def[0].s) && BLACK(def[1].s))) return { ok: false, error: 'Пара защиты одного цвета' };
  }
  const fort = turn.fortifyLane;
  if (fort !== null && fort !== undefined && ![0, 1, 2].includes(fort))
    return { ok: false, error: 'fortifyLane: 0..2 или null' };
  return { ok: true };
}

// Нормализация хода после validateTurn: id-строки → объекты карт для движка.
export function materializeTurn(hand, turn) {
  const byId = new Map(hand.map((c) => [c.id, c]));
  return {
    placements: turn.placements.map((p) => ({
      lane: p.lane,
      attack: p.attack.map((id) => byId.get(id)),
      defense: p.defense.map((id) => byId.get(id)),
    })),
    fortifyLane: turn.fortifyLane ?? null,
  };
}
