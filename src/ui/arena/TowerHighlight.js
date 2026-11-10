// Подсветка башен: idle → hover → selected-attack/selected-defense → resolving.
// Отдельным слоем (.tower-highlight + .platform-glow) поверх/под спрайтом,
// исходные PNG не изменяются. Hover — CSS, выбор — класс от состояния слотов.

// Класс подсветки по состоянию пары карт на башне.
export function towerHighlightClass({ kind, cards, dead, resolving }) {
  if (resolving) return 'is-resolving';
  if (dead) return 'is-idle';
  if (cards.length > 0) return kind === 'atk' ? 'is-sel-atk' : 'is-sel-def';
  return 'is-idle';
}

// Теги для state-машины (используются тестами и редактором).
export const HIGHLIGHT_STATES = ['idle', 'hover', 'selected-attack', 'selected-defense', 'resolving'];
