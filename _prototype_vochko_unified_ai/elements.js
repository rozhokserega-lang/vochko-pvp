import {combo} from './combos.js';
const specs=[['fire','♥♥',20,-10],['water','♦♦',10,10],['earth','♠♠',-5,25],['air','♣♣',5,15],['steam','♥♦',10,10],['lava','♥♠',20,-5],['fire_vortex','♥♣',15,0],['ice','♦♠',0,20],['thunderstorm','♦♣',15,5],['sandstorm','♠♣',5,15]];
export function pairStats(cards){const suits=cards.map(x=>x.s).sort().join('');const s=specs.find(x=>[...x[1]].sort().join('')===suits);if(!s)throw Error('Unknown element');const base=combo(cards);return {element:s[0],attack:Math.round(base*(1+s[2]/100)),defense:Math.round(base*(1+s[3]/100))};}
