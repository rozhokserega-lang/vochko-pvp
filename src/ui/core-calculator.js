import {deck} from '../../shared/cards.js';
import {ELEMENTS} from '../../shared/elements.js';
import {RECOMMENDED,COUNTERS} from '../../shared/abilities.js';
import {CORE_SUITS,CORE_TIERS,coreTier} from '../../shared/nexus-core.js';
import {corePreview} from '../../shared/core-preview.js';
import {abilityDescription} from '../../shared/ability-description.js';
import {art} from './fortress-art.js';

export function mountCoreCalculator(parent){
 const root=document.createElement('section');root.className='core-calculator';root.setAttribute('aria-label','Калькулятор Ядра Нексуса');
 root.innerHTML=`<h3>Попробуй своё Ядро</h3><p>Выбери карту и сравни способности без Ядра и с усилением.</p><div class="core-calc-controls"><div class="core-demo-card" aria-hidden="true"></div><div><fieldset><legend>Масть карты Ядра</legend><div class="core-suit-picker">${Object.entries(CORE_SUITS).map(([s,info],i)=>`<label><input type="radio" name="core-demo-suit" value="${s}" ${i===0?'checked':''}><span>${s} ${info.name}</span></label>`).join('')}</div></fieldset><label class="core-rank-label">Достоинство карты <select class="select-card" data-core-rank>${['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(r=>`<option ${r==='7'?'selected':''}>${r}</option>`).join('')}</select></label><p class="core-calc-summary" role="status" aria-live="polite"></p></div></div><div class="core-calc-results"></div><p class="core-calc-unchanged"></p><p class="guide-note">Показаны значения при выполнении условий способности, по рекомендованному балансу. Ядро не создаёт новые способности и не отменяет контрстихии. Сила пары и её обычные бонусы остаются прежними.</p>`;
 const update=()=>{
  const suit=root.querySelector('input:checked').value,rank=root.querySelector('[data-core-rank]').value,card=deck().find(c=>c.s===suit&&c.r===rank),results=corePreview(card);
  const demo=root.querySelector('.core-demo-card');demo.textContent=rank+suit;demo.dataset.red=['♥','♦'].includes(suit);
  root.querySelector('.core-calc-summary').textContent=`${rank}${suit} · Стихия: ${CORE_SUITS[suit].name} · уровень ${CORE_TIERS[coreTier(card)-1]} · усилены 4 стихии`;
  root.querySelector('.core-calc-results').innerHTML=results.map(({element,abilities})=>`<article class="core-upgrade-card"><header><img src="${art[element.id].still}" alt="" width="54" height="54"><h4>${element.name}</h4><span>Усилена</span></header>${abilities.map(({ability,metrics})=>`<div class="core-upgrade-ability"><h5>${ability.role==='attack'?'⚔ Атака':'🛡 Защита'} · ${ability.name}</h5>${metrics.map(m=>`<div class="core-upgrade-metric"><span>${m.label}</span><div><span class="before">${m.before}${m.unit}</span><span aria-hidden="true"> → </span><span class="sr-only"> станет </span><strong>${m.after}${m.unit}</strong></div></div>`).join('')}<small>Без Ядра: ${abilityDescription(ability,RECOMMENDED)}.</small></div>`).join('')}<footer>Контрстихия: ${COUNTERS[element.id].map(id=>ELEMENTS[id].name).join(', ')}</footer></article>`).join('');
  root.querySelector('.core-calc-unchanged').textContent='Без изменений: '+Object.values(ELEMENTS).filter(e=>!e.suits.includes(suit)).map(e=>e.name).join(', ')+'.';
 };
 root.addEventListener('change',update);parent.prepend(root);update();return root;
}
