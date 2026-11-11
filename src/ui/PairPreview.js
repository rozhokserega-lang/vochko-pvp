import { pairExplanation } from './Placement.js';
import { comboDetails } from '../../shared/combos.js';
import { elementName } from '../../shared/elements.js';

const previewCard = (c) => `<span class="preview-card ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}${c.s}</span>`;

// Предпросмотр пары до размещения и по клику на собранную пару (v1.5).
export function renderPreview(container, cards) {
  if (!cards || cards.length === 0) {
    container.innerHTML = '<span class="muted">💡 Выбери две карты, чтобы увидеть силу комбинации. Также можно нажать на собранную пару на башне.</span>';
    return;
  }
  if (cards.length === 1) {
    container.innerHTML = `<div class="preview-cards">${previewCard(cards[0])} <span class="muted">Выбери вторую карту для расчёта комбинации</span></div>`;
    return;
  }
  const d = comboDetails(cards);
  container.innerHTML = `<div class="preview-cards">${previewCard(cards[0])}${previewCard(cards[1])} <strong>${elementName(cards)} · ${d.name}</strong></div>
    <div>Сила карт: <strong>${d.base}</strong> · Множитель: <strong>×${d.m.toLocaleString('ru-RU')}</strong> · Итог: <strong>${d.power}</strong></div>
    <div class="muted">${pairExplanation(cards)}</div>`;
}

// Разбор атакующей пары, защиты соперника и фактически снятого HP.
const side = (r) => `<div class="calc-box">
  <p>Атака: ${r.attack.map(c => c.r + c.s).join(' + ')}<br>${pairExplanation(r.attack)}</p>
  <p>Защита соперника: ${r.defense.map(c => c.r + c.s).join(' + ')}<br>${pairExplanation(r.defense)}</p>
  <div class="calc-row"><span>Сила атакующей пары</span><strong>${r.info.a}</strong></div>
  <div class="calc-row"><span>Сила защитной пары соперника</span><strong>${r.info.d}</strong></div>
  <div class="calc-row"><span>Урон: max(0, атака − защита)</span><strong>${r.info.hit}</strong></div>
  <div class="calc-row"><span>Снято HP (${r.stage})</span><strong>${r.dealt}</strong></div></div>`;


export function roundReportHTML(view, mySeat) {
  const rep = view.latestRoundReport;
  if (!rep) return '<div class="legend">После боя здесь появится подробный разбор каждой линии.</div>';
  return rep.report.map((row) => {
    const mine = mySeat === 1 ? row.a : row.b;
    const theirs = mySeat === 1 ? row.b : row.a;
    return `<button class="report-btn" data-lane="${row.lane}"><b>${['ВЕРХ', 'ЦЕНТР', 'НИЗ'][row.lane]}</b>
      <small>⚔ Нанесено: ${mine.dealt} HP · 🛡 Получено: ${theirs.dealt} HP</small>
      <small>Атакующая пара против защитной · нажми для деталей</small></button>`;
  }).join('') + `<div class="explain-overlay" id="explainOverlay"><div class="explain-dialog">
      <button class="explain-close" data-close>✕</button><div id="explainContent"></div></div></div>`;
}

export function wireReportClicks(container, view, mySeat) {
  container.querySelectorAll('[data-lane]').forEach((btn) => {
    btn.onclick = () => {
      const row = view.latestRoundReport.report.find((r) => r.lane === +btn.dataset.lane);
      const mine = mySeat === 1 ? row.a : row.b;
      const theirs = mySeat === 1 ? row.b : row.a;
      container.querySelector('#explainContent').innerHTML =
        `<h3>Моя атака против их защиты</h3>${side(mine)}<h3>Их атака против моей защиты</h3>${side(theirs)}`;
      container.querySelector('#explainOverlay').classList.add('show');
    };
  });
  container.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.explain-overlay').classList.remove('show')));
}
