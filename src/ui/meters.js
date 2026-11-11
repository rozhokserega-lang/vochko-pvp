// Шкалы силы и карточные фрагменты — общие для старого поля v19 и арены v20.
// Вынесены из Board.js, чтобы арена не тянула за собой старые ассеты в бандл.
import { type, pairStats } from '../../shared/elements.js';

export const cardHTML = (c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}<span class="suit">${c.s}</span></span>`;

// Шкалы силы над башнями: последняя ширина запоминается для плавной анимации.
export const METER_LAST = new Map();

export function meterHTML(cards, kind, lane) {
  const complete = cards.length === 2;
  const stats = pairStats(cards);
  const power = stats ? (kind === 'atk' ? `⚔ ${stats.attack}` : `🛡 ${stats.defense}`) : (kind === 'atk' ? '⚔ 0' : '🛡 0');
  const element = complete ? type(cards) : '';
  const key = lane + '-' + kind;
  const pct = complete ? 100 : 0;
  const previous = METER_LAST.has(key) ? METER_LAST.get(key) : 0;
  METER_LAST.set(key, pct);
  const caption = kind === 'atk' ? 'АТАКА' : 'ЗАЩИТА';
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

// Предпросмотр показывает только действующую характеристику роли.
export function combatPowerHTML(_kind, power) {
  const shield = _kind === 'def' ? (power?.defense ?? power?.d ?? 0) : 0;
  const attack = _kind === 'atk' ? (power?.attack ?? power?.a ?? 0) : 0;
  return `<div class="tower-shield tower-meter" ${shield ? '' : 'data-empty'} aria-label="Щит: ${shield}">
    <span class="tower-meter-label"><span class="shield-caption">Щит </span><b>${shield}</b></span>
    <div class="tower-meter-track"><i style="height:${shield ? 100 : 0}%"></i></div>
  </div>${attack ? `<span class="tower-attack" aria-label="Атака: ${attack}">⚔ ${attack}</span>` : ''}`;
}
