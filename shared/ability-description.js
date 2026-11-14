import {resolveVariants} from './abilities.js';
export function abilityDescription(a,variants){
  const v=resolveVariants(variants);
  return ({fire_retaliation:v.fireRetaliation==='onHit'?'При поглощении удара щитом — 2 ответного урона':v.fireRetaliation==='blocked3'?'При полной блокировке — 3 ответного урона':a.desc,
    water_strip_armor:`Снять до ${v.waterStrip==='two'?2:3} временной брони перед ударом`,water_cleanse:`Очистить негативные статусы; если их нет — вылечить ${v.waterCleanse==='heal1'?1:2} HP`,
    steam_dampen:`Снизить входящий урон на ${v.steamDampen==='pct15'?15:10}%; при полной блокировке вылечить 2 HP`,lava_counter:`При успешном попадании противника — ${v.lavaCounter==='three'?3:2} ответного урона`,
    lava_pierce_burn:`Пробить ${v.lavaPierce==='pct5'?5:10}% защиты; при попадании поджог 1${v.lavaPierce==='burnArmor'?' только по цели с временной бронёй':''}`,
    sandstorm_shield:`Получить +${v.sandstormShield==='three'?3:4} щита текущего раунда`})[a.id]??a.desc;
}
