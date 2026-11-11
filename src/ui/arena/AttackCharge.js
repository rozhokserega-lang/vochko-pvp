import { ELEMENTS, pairStats } from '../../../shared/elements.js';
import { elementAnimHTML } from './ElementEffect.js';

const COLORS = {
  fire: '#ff874d', water: '#54cfff', earth: '#d4aa77', air: '#c4edff',
  steam: '#e4eaf7', lava: '#ff632c', fire_vortex: '#ffad48', ice: '#9eefff',
  thunderstorm: '#a9a0ff', sandstorm: '#e1bd7b',
};

export function attackChargeHTML(cards) {
  const stats = pairStats(cards);
  if (!stats) return '';
  const element = ELEMENTS[stats.element];
  const size = .88 + Math.min(stats.attack, 60) / 60 * .22;
  return `<div class="tower-attack attack-charge" aria-label="Атака: ${stats.attack}" data-attack-key="${cards.map(c => c.id).sort().join(',')}" style="--attack-color:${COLORS[element.id]};--charge-scale:${size}">
    <span class="attack-charge-core" aria-hidden="true"><i class="attack-orbit orbit-a"></i><i class="attack-orbit orbit-b"></i>${elementAnimHTML(element.icon)}<i class="attack-spark spark-a"></i><i class="attack-spark spark-b"></i></span>
    <span class="attack-charge-value"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l16 16-2 2L3 5V3h2zm8 12l-5 5m-3-3l6 6"/></svg><b>${stats.attack}</b></span>
  </div>`;
}

// Cosmetic only: the combat report remains the sole source of damage.
// Both a completely blocked attack and a damaging attack still launch a charge.
export function launchAttackCharge(target, elementIcon, power) {
  if (!target || power <= 0) return;
  const element = Object.values(ELEMENTS).find(e => e.icon === elementIcon);
  if (!element) return;
  const rect = target.getBoundingClientRect();
  const charge = target.querySelector('.attack-charge');
  const origin = charge?.querySelector('.attack-charge-core')?.getBoundingClientRect();
  const mine = target.classList.contains('ally');
  const x = origin ? origin.left + origin.width / 2 : rect.left + rect.width * (mine ? -.25 : 1.25);
  const y = origin ? origin.top + origin.height / 2 : rect.top + rect.height * .5;
  const tx = rect.left + rect.width * .5, ty = rect.top + rect.height * .52;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 0 : 450;
  charge?.classList.add('charge-fired');
  if (!reduced) {
    const projectile = document.createElement('div');
    projectile.className = 'attack-projectile';
    projectile.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(16, Math.min(40, rect.width*.38))}px;--attack-color:${COLORS[element.id]};--flight-x:${tx-x}px;--flight-y:${ty-y}px;`;
    projectile.innerHTML = elementAnimHTML(element.icon);
    document.body.appendChild(projectile);
    projectile.addEventListener('animationend', () => projectile.remove(), {once:true});
  }
  const impact = document.createElement('div');
  impact.className = 'attack-impact-flash';
  impact.style.cssText = `left:${tx}px;top:${ty}px;width:${Math.max(25,rect.width*.8)}px;--attack-color:${COLORS[element.id]};animation-delay:${duration}ms;`;
  document.body.appendChild(impact);
  impact.addEventListener('animationend', () => impact.remove(), {once:true});
}

// Retain a prepared orb when another lane changes, so it does not recharge.
export function retainAttackCharges(previous, next) {
  if (!previous || previous.dataset.meterContext !== next.dataset.meterContext) return () => {};
  const kept = [];
  for (const tower of next.querySelectorAll('.tower-art[data-arena-id]')) {
    const old = [...previous.querySelectorAll('.tower-art[data-arena-id]')]
      .find(t => t.dataset.arenaId === tower.dataset.arenaId)?.querySelector('.attack-charge');
    const fresh = tower.querySelector('.attack-charge');
    if (!old || !fresh || old.dataset.attackKey !== fresh.dataset.attackKey) continue;
    const running = old.getAnimations({subtree:true}).map(a => ({name:a.animationName,target:a.effect?.target,time:a.currentTime}));
    fresh.replaceWith(old);kept.push({old,running});
  }
  return () => {
    for (const {old,running} of kept) for (const a of old.getAnimations({subtree:true})) {
      const saved = running.find(s => s.name === a.animationName && s.target === a.effect?.target);
      if (saved?.time != null) a.currentTime = saved.time;
    }
  };
}
