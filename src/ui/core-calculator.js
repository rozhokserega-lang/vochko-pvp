import {RANKS} from '../../shared/cards.js';
import {addCoreXp,coreBonuses,CORE_UPGRADES,cardXp} from '../../shared/core-progression.js';
export function mountCoreCalculator(parent){
 const root=document.createElement('section');root.className='core-calculator';root.setAttribute('aria-label','Калькулятор Ядра Нексуса');
 root.innerHTML=`<h3>Попробуй своё Ядро</h3><p>Выбери накопленный XP и последнюю карту. Масть не влияет на результат.</p><div class="core-calc-controls"><label>Текущий XP: <output data-xp-value>0</output><input type="range" data-current-xp min="0" max="100" value="0"></label><label>Карта Ядра <select data-core-rank>${RANKS.map(r=>`<option>${r}</option>`).join('')}</select></label></div><p class="core-calc-summary" role="status" aria-live="polite"></p><div class="core-calc-results"></div>`;
 const update=()=>{const xp=Number(root.querySelector('[data-current-xp]').value),rank=root.querySelector('[data-core-rank]').value,board={nexus:80};addCoreXp(board,xp);const before=coreBonuses(board),next=addCoreXp(board,cardXp({r:rank})),after=coreBonuses(board);
 root.querySelector('[data-xp-value]').textContent=xp;root.querySelector('.core-calc-summary').textContent=`${xp} + ${cardXp({r:rank})} → ${next.xp}/100 XP · Уровень ${next.level}/5`;
 root.querySelector('.core-calc-results').innerHTML=`<article class="core-upgrade-card"><p>Бонус HP: +${before.hp} → +${after.hp}</p><p>Бонус атаки пары: +${before.attack} → +${after.attack}</p><p>Щит Нексуса: +${before.shield} → +${after.shield}</p><ul>${CORE_UPGRADES.map(u=>`<li>${next.level>=u.level?'✓':'🔒'} ${u.xp} XP · ${u.text}</li>`).join('')}</ul></article>`;};root.addEventListener('input',update);root.addEventListener('change',update);parent.prepend(root);update();return root;
}
