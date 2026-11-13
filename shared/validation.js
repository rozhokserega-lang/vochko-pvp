// attack — атакующая пара, defense — защитная; в обеих разрешены любые масти.
export function fortifyAllowed(_used, lane) {
  return lane == null ? { ok: true } : { ok: false, error: 'fortify-disabled' };
}

export function validateTurn(hand, turn, { nexusCoreEnabled=false, requireCore=nexusCoreEnabled }={}) {
  if (!turn || !Array.isArray(turn.placements) || turn.placements.length !== 3)
    return { ok: false, error: 'Нужно ровно 3 линии' };
  if (Object.keys(turn).some(k => !['placements', 'fortifyLane', ...(nexusCoreEnabled?['coreCardId']:[])].includes(k)))
    return { ok: false, error: 'Недопустимое действие или характеристики' };
  if (turn.fortifyLane != null) return fortifyAllowed(false, turn.fortifyLane);
  const lanes = turn.placements.map(p => p?.lane).sort();
  if (JSON.stringify(lanes) !== '[0,1,2]')
    return { ok: false, error: 'Линии должны быть 0, 1, 2 без повторов' };
  const byId = new Map(hand.map(c => [c.id, c]));
  const seen = new Set();
  for (const p of turn.placements) {
    if (Object.keys(p).some(k => !['lane', 'attack', 'defense'].includes(k)))
      return { ok: false, error: 'Передавай только идентификаторы карт' };
    if (!Array.isArray(p.attack) || !Array.isArray(p.defense) || p.attack.length !== 2 || p.defense.length !== 2)
      return { ok: false, error: 'На линии нужны ровно две пары по две карты' };
    for (const id of [...p.attack, ...p.defense]) {
      if (typeof id !== 'string' || !byId.has(id)) return { ok: false, error: 'Карты нет в руке' };
      if (seen.has(id)) return { ok: false, error: 'Карта использована дважды: ' + id };
      seen.add(id);
    }
  }
  if(nexusCoreEnabled){
    if(hand.length!==13)return {ok:false,error:'Для Ядра нужна серверная рука из 13 карт'};
    if(turn.coreCardId!=null){
      if(typeof turn.coreCardId!=='string'||!byId.has(turn.coreCardId))return {ok:false,error:'Карты Ядра нет в руке'};
      if(seen.has(turn.coreCardId))return {ok:false,error:'Карта Ядра уже использована в паре'};
    }else if(requireCore)return {ok:false,error:'Помести последнюю карту в Ядро Нексуса'};
  }
  return { ok: true };
}

export function materializeTurn(hand, turn, options) {
  const check = validateTurn(hand, turn, options);
  if (!check.ok) throw new Error(check.error);
  const byId = new Map(hand.map(c => [c.id, c]));
  return { placements: [...turn.placements].sort((a, b) => a.lane - b.lane).map(p => ({
    lane: p.lane, attack: p.attack.map(id => byId.get(id)), defense: p.defense.map(id => byId.get(id)),
  })), fortifyLane: null, ...(options?.nexusCoreEnabled?{coreCard:byId.get(turn.coreCardId)}:{}) };
}
