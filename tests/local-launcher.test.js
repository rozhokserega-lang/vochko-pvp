import {test} from 'node:test';import assert from 'node:assert/strict';
import {startLocalGame} from '../scripts/dev-local.mjs';
import {botPlan} from '../shared/bot.js';
test('local launcher accepts versioned deal, completes bot round and restores a room member',async()=>{
  const server=await startLocalGame(5198);
  try{
    const post=async(action,body={},user='local-owner')=>{const r=await fetch('http://127.0.0.1:5198/__local/'+action,{method:'POST',headers:{'content-type':'application/json','x-local-user':user},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
    const room=await post('create-room',{vsBot:true}),view=await post('get-state',{matchId:room.matchId});
    assert.equal(view.rules.dealMode,'random');
    const placements=botPlan(view.me.hand,view.board.opponent,view.board.me).map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)}));
    const result=await post('submit-turn',{matchId:room.matchId,round:1,placements});assert.equal(result.resolved,true);
    const next=await post('get-state',{matchId:room.matchId});assert.equal(next.round,2);assert.equal(next.me.hand.length,14);assert.ok(next.latestRoundReport.abilityEvents);
    assert.equal((await post('join-room',{roomCode:room.roomCode})).matchId,room.matchId);
  }finally{await server.close();}
});
