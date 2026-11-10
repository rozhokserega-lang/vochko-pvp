// Интерактивный слот карты поверх нарисованной рамки башни/нексуса.
// Карта, вставленная в слот, живёт внутри .card-slot и не выходит
// за золотую рамку. Клик по слоту всплывает на башню (.drop-target),
// поэтому main.js продолжает работать без изменений.

export function cardSlotHTML(idx, cards, extraClass = '') {
  const card = cards[idx];
  const cls = `card-slot ${card ? 'filled' : ''} ${extraClass}`;
  return `<div class="${cls}" data-slot="${idx}">
    ${card
      ? `<span class="slot-card ${'♥♦'.includes(card.s) ? 'red' : ''}${card.justPlaced ? ' just-placed' : ''}"><i class="rank">${card.r}</i><span class="suit">${card.s}</span></span>`
      : '<span class="slot-empty" aria-hidden="true"></span>'}
  </div>`;
}
