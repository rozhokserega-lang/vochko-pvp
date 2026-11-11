// Tower-only crystal meter. Nexus markup and meters stay independent.
const clamp = (n, max) => Math.min(max, Math.max(0, Number(n) || 0));

export function towerHealthHTML(hp, max, shield = 0, charging = false) {
  hp = clamp(hp, max); shield = Math.max(0, Number(shield) || 0);
  return `<div class="tower-hp tower-meter tower-crystal ${shield ? 'shielded' : ''} ${charging ? 'shield-charging' : ''} ${hp > 0 && hp / max <= .25 ? 'critical' : ''}" data-hp="${hp}" data-max="${max}" data-shield="${shield}">
    <div class="crystal-core">
      <div class="crystal-well tower-meter-track">
        <span class="crystal-lag" style="height:${hp / max * 100}%"></span>
        <i class="crystal-fill" data-vertical="1" style="height:${hp / max * 100}%"><span class="crystal-facets"></span></i>
      </div>
      <div class="crystal-frame"></div><span class="crystal-cap top"></span><span class="crystal-cap bottom"></span>
      <div class="crystal-shell" aria-hidden="true"><span class="crystal-shield-energy"></span><svg viewBox="0 0 100 300" preserveAspectRatio="none"><path class="crystal-glass" d="M50 3 Q94 12 96 50 L96 250 Q90 286 50 297 Q10 286 4 250 L4 50 Q6 12 50 3Z"/><path class="crystal-outline" pathLength="100" d="M50 3 Q94 12 96 50 L96 250 Q90 286 50 297 Q10 286 4 250 L4 50 Q6 12 50 3Z"/><path class="crystal-cracks" d="M90 65L71 90L83 113L64 138 M8 218L28 200L20 178L42 153"/><g class="crystal-runes"><text x="50" y="26">ᛟ</text><text x="50" y="286">ᛉ</text></g></svg></div>
      <div class="crystal-impact" aria-hidden="true"></div>
    </div>
    <span class="tower-meter-label crystal-readout"><b class="value">${hp} / ${max}</b></span>
    <div class="tower-shield crystal-shield" ${shield ? '' : 'data-empty'} aria-label="Щит: ${shield}"><b>${shield}</b><span class="tower-meter-track" hidden><i style="height:${shield ? 100 : 0}%"></i></span></div>
  </div>`;
}

export function setTowerShield(target, amount, full = amount) {
  const meter = target?.querySelector('.tower-crystal');
  if (!meter) return; // In particular, never touch a Nexus.
  amount = Math.max(0, Number(amount) || 0);
  const previous = Number(meter.dataset.shield) || 0;
  meter.dataset.shield = String(amount);
  meter.style.setProperty('--shield-ratio', full > 0 ? clamp(amount / full, 1) : 0);
  meter.classList.toggle('shielded', amount > 0);
  meter.classList.toggle('shield-cracked', amount > 0 && amount / full <= .5);
  if (amount > previous) meter.classList.remove('shield-hit', 'shield-break');
  if (previous > amount) {
    meter.classList.remove('shield-hit', 'shield-break');
    void meter.offsetWidth;
    meter.classList.add(amount ? 'shield-hit' : 'shield-break');
  }
  const label = meter.querySelector('.crystal-shield');
  label.toggleAttribute('data-empty', amount === 0);
  label.querySelector('b').textContent = String(amount);
  label.setAttribute('aria-label', `Щит: ${amount}`);
}

export function setTowerHealth(target, hp, max) {
  const meter = target?.querySelector('.tower-crystal');
  if (!meter) return;
  hp = clamp(hp, max);
  meter.dataset.hp = String(hp);
  meter.querySelector('.crystal-lag').style.height = hp / max * 100 + '%';
  meter.classList.toggle('critical', hp > 0 && hp / max <= .25);
  meter.classList.toggle('destroyed', hp === 0);
  meter.classList.remove('hp-hit');
  void meter.offsetWidth;
  meter.classList.add('hp-hit');
}
