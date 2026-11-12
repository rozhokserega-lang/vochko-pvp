import test from 'node:test';import assert from 'node:assert/strict';
import {deal} from './cards.js';import {seeded,candidate,choosePlan} from './monte-carlo-bot.js';import {initialMatch,resolveAbilitiesRound} from './abilities-engine.js';
test('deal: 14 cards, 7 red, 7 black, unique',()=>{const hand=deal(seeded(11));assert.equal(hand.length,14);assert.equal(new Set(hand.map(c=>c.id)).size,14);assert.equal(hand.filter(c=>'♥♦'.includes(c.s)).length,7);});
test('plan: 12 distinct cards, 3 lanes',()=>{const rng=seeded(2),h=deal(rng),s=initialMatch();const plan=candidate(h,s.a,s.b,rng);assert.equal(plan.length,3);assert.equal(new Set(plan.flatMap(p=>[...p.attack,...p.defense]).map(c=>c.id)).size,12);});
test('search does not mutate state',()=>{const rng=seeded(8),s=initialMatch(),before=JSON.stringify(s);choosePlan({state:s,hand:deal(rng),rng,candidates:3,samples:2});assert.equal(JSON.stringify(s),before);});
test('simultaneous resolution and round advance',()=>{const rng=seeded(7),s=initialMatch(),a=candidate(deal(rng),s.a,s.b,rng),b=candidate(deal(rng),s.b,s.a,rng);const r=resolveAbilitiesRound(s,a,b);assert.equal(s.round,2);assert.equal(r.reports.length,6);});
