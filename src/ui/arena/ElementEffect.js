import { ELEMENTS } from '../../../shared/elements.js';
// Готовые 9-кадровые анимации стихий (animated webp) в круге стихии.
// Никаких CSS-замен: круг пуст, пока не установлены обе карты; анимация
// появляется только когда движок определил стихию для пары.
import { ARENA_ASSETS } from './arena-assets.js';
import { LAYOUT } from './arenaLayout.js';
const FIRE_VORTEX_URL = new URL('./assets/elFireVortex.gif', import.meta.url).href;

// Ключ стихии (fire/water/…) — тем же словарём пользуется старый Board.
export const ELEMENT_CLASS = Object.fromEntries(Object.values(ELEMENTS).map(e => [e.icon, e.id]));

/** <img> анимации стихии для круга. Пустая строка, если стихии нет —
 *  выдумывать анимацию для неопределённой пары запрещено. */
export function elementAnimHTML(elementEmoji) {
  const key = ELEMENT_CLASS[elementEmoji];
  const fallback = { lava: 'fire', ice: 'water', thunderstorm: 'storm', sandstorm: 'storm' };
  const asset = key ? LAYOUT.elementAnim[fallback[key] || key] : null;
  const source = key === 'fire_vortex' ? FIRE_VORTEX_URL : ARENA_ASSETS[asset];
  if (!source) return '';
  return `<img class="element-anim effect-${key}" data-effect="${key}" src="${source}" alt="" draggable="false" loading="lazy">`;
}
