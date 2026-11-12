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
  return `<div class="tower-attack attack-charge" aria-label="Атака: ${stats.attack}" data-attack-key="${cards.map(c => c.id).sort().join(',')}">
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
  const mine = !!target.closest('.ally');
  const tx = rect.left + rect.width * .5, ty = rect.top + rect.height * .52;
  // Targets on our side receive enemy spells from above. Our spells enter
  // enemy targets from below, independently of the player's server seat.
  const arena = document.querySelector('#arenaScene')?.getBoundingClientRect() ?? rect;
  const x = tx;
  const y = mine ? Math.max(12, arena.top + 12) : Math.min(innerHeight - 12, arena.bottom - 12);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 0 : 450;
  charge?.classList.add('charge-fired');
  if (!reduced) {
    const projectile = document.createElement('div');
    projectile.className = 'attack-projectile';
    projectile.dataset.attacker = mine ? 'opponent' : 'me';
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

// Retain the attack indicator when another lane changes.
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
