// Финальный экран: результат, реванш, выход.
export function EndScreen({ title, message, canRematch, onRematch, onLeave }) {
  const root = document.createElement('div');
  root.className = 'end-overlay show';
  root.innerHTML = `<div class="end-dialog">
    <h2>${title}</h2><p>${message}</p>
    ${canRematch ? '<button data-act="rematch">🔁 Реванш</button>' : ''}
    <button data-act="leave">🚪 Выйти</button></div>`;
  const rematchBtn = root.querySelector('[data-act="rematch"]');
  if (rematchBtn) rematchBtn.onclick = () => onRematch(rematchBtn);
  root.querySelector('[data-act="leave"]').onclick = () => onLeave();
  return root;
}
