export function combatPowerHTML(kind, power) {
  const shield = kind === 'def' ? power?.d ?? 0 : 0;
  return `<div class="tower-shield tower-meter" ${shield ? '' : 'data-empty'} aria-label="Щит: ${shield}">
    <span class="tower-meter-label"><span class="shield-caption">Щит </span><b>${shield}</b></span>
    <div class="tower-meter-track"><i style="height:${shield ? 100 : 0}%"></i></div>
  </div>
  ${kind === 'atk' && power ? `<span class="tower-attack" aria-label="Атака: ${power.a}">⚔ ${power.a}</span>` : ''}`;
}
