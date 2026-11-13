import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deck} from '../shared/cards.js';
import {corePreview} from '../shared/core-preview.js';
const card=(s,r)=>deck().find(c=>c.s===s&&c.r===r);
test('all physical Core cards preview exactly their four elements and both roles',()=>{
 for(const c of deck()){
  const results=corePreview(c);assert.equal(results.length,4);
  for(const {element,abilities} of results){assert.ok(element.suits.includes(c.s));assert.deepEqual(abilities.map(a=>a.ability.role),['attack','defense']);for(const a of abilities)for(const m of a.metrics)assert.ok(Number.isFinite(m.after)&&m.after>m.before);}
 }
});
test('Core preview shows recommended baseline and additive percentage changes',()=>{
 const earth=corePreview(card('♠','2')).find(x=>x.element.id==='earth');assert.deepEqual(earth.abilities[0].metrics.map(m=>[m.before,m.after,m.unit]),[[15,17,'%']]);
 const water=corePreview(card('♦','A')).find(x=>x.element.id==='water');assert.deepEqual(water.abilities.map(a=>a.metrics.map(m=>[m.before,m.after])),[[[2,6]],[[1,5]]]);
});
test('Steam preview exposes both damage reduction and healing',()=>{
 const steam=corePreview(card('♥','7')).find(x=>x.element.id==='steam');assert.deepEqual(steam.abilities[1].metrics.map(m=>[m.before,m.after]),[[15,19],[2,4]]);
});
