// Шкалы силы и карточные фрагменты — общие для старого поля v19 и арены v20.
// Вынесены из Board.js, чтобы арена не тянула за собой старые ассеты в бандл.
import { type } from '../../shared/elements.js';
import { combo } from '../../shared/combos.js';

export const cardHTML = (c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}<span class="suit">${c.s}</span></span>`;

// Шкалы силы над башнями: последняя ширина запоминается для плавной анимации.
export const METER_LAST = new Map();

export function meterHTML(cards, kind, lane) {
  const complete = cards.length === 2;
  const power = complete ? combo(cards) : 0;
  const element = complete ? type(cards) : '';
  const key = lane + '-' + kind;
  const pct = complete ? 100 : 0;
  const previous = METER_LAST.has(key) ? METER_LAST.get(key) : 0;
  METER_LAST.set(key, pct);
  const caption = kind === 'atk' ? '⚔ АТАКА' : '🛡 ЗАЩИТА';
  return `<div class="power-meter ${kind === 'atk' ? 'power-attack' : 'power-defense'}" aria-label="${caption}: ${power} из ${power} (полная шкала)">
    <div class="power-meter-head"><span>${caption}</span><strong>${power}</strong><span class="power-element">${element}</span></div>
    <div class="power-meter-track"><i data-meter-target="${pct}" style="width:${previous}%"></i></div>
  </div>`;
}

export function animateMeters() {
  // Без requestAnimationFrame: в перекрытых окнах RAF замирает и шкала
  // остаётся пустой; обычный таймер работает всегда.
  setTimeout(() => {
    document.querySelectorAll('[data-meter-target]').forEach((el) => {
      el.style.width = el.dataset.meterTarget + '%';
    });
  }, 30);
}
