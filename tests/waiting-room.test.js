import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomRules} from '../src/ui/waiting-room/roomRules.js';
import {RECOMMENDED} from '../shared/abilities.js';
import {serverFixture} from './server-fixture.mjs';
test('waiting room describes the actual room rules without assuming Core is enabled',()=>{
  assert.match(roomRules(undefined).deal,/Загрузка/);
  assert.equal(roomRules({nexusCoreEnabled:true,variants:RECOMMENDED}).deal,'13 карт + Ядро Нексуса');
  assert.equal(roomRules({nexusCoreEnabled:true,variants:RECOMMENDED}).balance,'Рекомендованный баланс');
  assert.ok(!roomRules({nexusCoreEnabled:false}).deal.includes('Ядро'));
  assert.equal(roomRules({variants:{fireRetaliation:'blocked'}}).balance,'Особые правила');
});
test('creator cancellation closes a waiting room and prevents subsequent joins',async()=>{
  const f=serverFixture();await f.call('create-room',1,{nexusCoreEnabled:true});
  assert.equal(f.match.status,'waiting');
  const before=structuredClone(f.match);
  assert.equal((await f.call('leave-room','outsider',{matchId:'fixture'})).status,404);assert.deepEqual(f.match,before);
  assert.equal((await f.call('leave-room',1,{matchId:'fixture'})).status,200);
  assert.equal(f.match.status,'finished');assert.equal((await f.call('join-room',2,{roomCode:'TEST'})).status,409);
  const state=(await f.call('get-state',1,{matchId:'fixture'})).body;
  assert.equal(state.status,'finished');assert.equal(state.board.me,null);
});
test('leaving an active match retains the existing reconnect behavior',async()=>{
  const f=serverFixture({core:true,persistent:true}),before=structuredClone(f.match.state.hands);
  assert.equal((await f.call('leave-room',1,{matchId:'fixture'})).status,200);
  assert.equal(f.match.status,'planning');assert.deepEqual(f.match.state.hands,before);
  assert.equal((await f.call('join-room',1,{roomCode:'TEST'})).status,200);
});
