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
    <div class="muted">Это сила пары до брони и контрстихий соперника.</div>`;
}

// Разбор последнего раунда: обе стороны, контрстихии, поджог, фактически снятое HP.
const side = (r) => `<div class="calc-box"><div class="report-pairs">${r.attack.map((c) => c.r + c.s).join(' + ')} ⚔ ${r.defense.map((c) => c.r + c.s).join(' + ')}</div>
  <div class="calc-row"><span>Сила атаки (с комбинацией)</span><strong>${r.info.baseA}</strong></div>
  <div class="calc-row"><span>Сила защиты (с комбинацией)</span><strong>${r.info.baseD}</strong></div>
  <div class="calc-row"><span>Контрстихия</span><strong>${r.info.match || 'Нет'}</strong></div>
  <div class="calc-row"><span>Атака после стихий</span><strong>${r.info.a}</strong></div>
  <div class="calc-row"><span>Защита после стихий</span><strong>${r.info.d}</strong></div>
  ${r.fortified ? '<div class="calc-row"><span>Укрепление активно</span><strong>⚔ ×0.85 · 🛡 ×1.25</strong></div>' : ''}
  <div class="calc-row"><span>Урон по расчёту</span><strong>${r.info.hit}</strong></div>
  <div class="calc-row"><span>Фактически снято HP (${r.stage})</span><strong>${r.dealt}</strong></div>
  <div class="calc-row"><span>Поджог на следующий раунд</span><strong>${r.burn || 0}</strong></div></div>`;

export function roundReportHTML(view, mySeat) {
  const rep = view.latestRoundReport;
  if (!rep) return '<div class="legend">После боя здесь появится подробный разбор каждой линии.</div>';
  return rep.report.map((row) => {
    const mine = mySeat === 1 ? row.a : row.b;
    const theirs = mySeat === 1 ? row.b : row.a;
    return `<button class="report-btn" data-lane="${row.lane}"><b>${['ВЕРХ', 'ЦЕНТР', 'НИЗ'][row.lane]}</b>
      <small>⚔ Нанесено: ${theirs.dealt} HP · 🛡 Получено: ${mine.dealt} HP</small>
      <small>${mine.info.match || 'Без контрстихии'} · нажми для деталей</small></button>`;
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
