// Готовые 9-кадровые анимации стихий (animated webp) в круге стихии.
// Никаких CSS-замен: круг пуст, пока не установлены обе карты; анимация
// появляется только когда движок определил стихию для пары.
import { ARENA_ASSETS } from './arena-assets.js';
import { LAYOUT } from './arenaLayout.js';

// Ключ стихии (fire/water/…) — тем же словарём пользуется старый Board.
export const ELEMENT_CLASS = { '🔥': 'fire', '💧': 'water', '🪨': 'earth', '🌪️': 'air', '♨️': 'steam', '🌫️': 'storm' };

/** <img> анимации стихии для круга. Пустая строка, если стихии нет —
 *  выдумывать анимацию для неопределённой пары запрещено. */
export function elementAnimHTML(elementEmoji) {
  const key = ELEMENT_CLASS[elementEmoji];
  const asset = key ? LAYOUT.elementAnim[key] : null;
  if (!asset || !ARENA_ASSETS[asset]) return '';
  return `<img class="element-anim" src="${ARENA_ASSETS[asset]}" alt="" draggable="false" loading="lazy">`;
}
