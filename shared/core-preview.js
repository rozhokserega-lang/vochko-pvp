import {ABILITIES, RECOMMENDED} from './abilities.js';
import {coreAbilityBonus, coreElements, coreTier} from './nexus-core.js';

// Values before Core bonuses under the same recommended variants used by rooms.
const metrics={
 fire_burn:[['burn','Горение',2,' HP']],fire_retaliation:[['damage','Ответный урон',2,' HP']],
 water_strip_armor:[['strip','Снятие брони',RECOMMENDED.waterStrip==='two'?2:3,'']],water_cleanse:[['heal','Лечение без негативных статусов',RECOMMENDED.waterCleanse==='heal1'?1:2,' HP']],
 earth_pierce_def:[['percent','Игнорирование защиты',15,'%']],earth_armor:[['armor','Броня следующего раунда',3,'']],
 air_weaken_def:[['percent','Ослабление защиты',10,'%']],air_reflect:[['damage','Отражённый урон',2,' HP']],
 steam_weaken_def:[['percent','Ослабление защиты',15,'%']],steam_dampen:[['percent','Снижение входящего урона',RECOMMENDED.steamDampen==='pct15'?15:10,'%'],['heal','Лечение при полной блокировке',2,' HP']],
 lava_pierce_burn:[['percent','Игнорирование защиты',10,'%'],['burn','Горение по цели с временной бронёй',1,' HP']],lava_counter:[['damage','Ответный урон',RECOMMENDED.lavaCounter==='three'?3:2,' HP']],
 fire_vortex_spread:[['burn','Горение на каждой соседней линии',1,' HP']],fire_vortex_zaslon:[['percent','Снижение атаки при горящей соседней линии',10,'%']],
 ice_weaken_def:[['percent','Ослабление защиты',10,'%']],ice_weaken_atk:[['percent','Ослабление атаки следующего раунда',15,'%']],
 thunderstorm_discharge:[['damage','Урон по другой линии',2,' HP']],thunderstorm_charge:[['charge','Атака следующего раунда',2,'']],
 sandstorm_weaken_atk:[['percent','Ослабление атаки следующего раунда',15,'%']],sandstorm_shield:[['shield','Щит текущего раунда',RECOMMENDED.sandstormShield==='three'?3:4,'']],
};
export function corePreview(card){
 if(!coreTier(card))throw Error('Choose a valid Core rank');
 const context={cores:{a:card},coreProfile:'balanced'};
 return coreElements(card.s).map(element=>({element,abilities:Object.values(ABILITIES).filter(a=>a.element===element.id).map(ability=>({ability,metrics:metrics[ability.id].map(([key,label,before,unit])=>({key,label,before,after:before+coreAbilityBonus(context,'a',ability.id,key),unit}))}))}));
}
