import { ELEMENTS, pairStats } from '../../shared/elements.js';

export function pairExplanation(cards) {
  const p = pairStats(cards);
  if (!p) return 'Выбери любые две карты';
  const e = ELEMENTS[p.element];
  const pct = n => (n > 0 ? '+' : '') + n + '%';
  return `${p.name}: (${cards[0].v} + ${cards[1].v}) ×${p.m} → база ${p.basePower}; ${e.name}: атака ${pct(e.attackBonus)}, защита ${pct(e.defenseBonus)} → ⚔ ${p.attack} / 🛡 ${p.defense}`;
}

export function placementHTML(slots, ready) {
  return '<p class="placement-help">Выбери любые две карты и нажми на пару или башню. Нажатие на пару без выбора снимает её. Две карты останутся в руке.</p>' + slots.map((s, lane) => {
    const pairs = [s.atk, s.def], stats = pairs.map(pairStats);
    return `<section class="placement-line" aria-label="Линия ${lane + 1}">
      <strong>${['Верх', 'Центр', 'Низ'][lane]} · ⚔ ${stats[0]?.attack ?? 0} · 🛡 ${stats[1]?.defense ?? 0}</strong>
      <div class="placement-pairs">${pairs.map((cards, i) => {
        const p = stats[i], e = p && ELEMENTS[p.element];
        return `<div class="placement-pair"><button class="pair-placement" data-lane="${lane}" data-kind="${i ? 'def' : 'atk'}" ${ready ? 'disabled' : ''}>
          <b>${i ? 'Защита' : 'Атака'}</b> <span>${cards.map(c => c.r + c.s).join(' + ') || '＋ две карты'}</span>
          <span>${e ? `${e.icon} ${e.name} · ${i ? '🛡 ' + p.defense : '⚔ ' + p.attack}` : 'Любые масти'}</span>
        </button><details><summary>Расчёт</summary><small>${pairExplanation(cards)}</small></details></div>`;
      }).join('')}</div></section>`;
  }).join('');
}

export function lineTotalsHTML(slots) {
  return slots.map((s,lane) => {
    const pairs = [s.atk, s.def].map(pairStats);
    return `<span><b>${['Верх','Центр','Низ'][lane]}</b> ⚔ ${pairs[0]?.attack ?? 0} · 🛡 ${pairs[1]?.defense ?? 0}</span>`;
  }).join('');
}
