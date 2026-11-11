import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverFixture } from './server-fixture.mjs';
import { lineStats } from '../shared/elements.js';
import { materializeTurn } from '../shared/validation.js';

const turn = (f, seat) => {
  const h = f.match.state.hands[seat];
  // Mixed-color pairs from the actual server hand.
  const cards = h.slice(0, 7).flatMap((c, i) => [c, h[i + 7]]);
  return { matchId: 'fixture', round: f.match.round, expectedVersion: 1,
    placements: [0, 1, 2].map(lane => ({ lane, attack: cards.slice(lane * 4, lane * 4 + 2).map(c => c.id), defense: cards.slice(lane * 4 + 2, lane * 4 + 4).map(c => c.id) })), fortifyLane: null };
};

test('real submit/get-state handlers: private hands, two submissions, one resolve, mirrored DTO', async () => {
  const f = serverFixture(), a = turn(f, 1), b = turn(f, 2);
  const { matchId, round, expectedVersion, ...raw } = a;
  const expected = lineStats(materializeTurn(f.match.state.hands[1], raw).placements[0]);
  assert.equal((await f.call('submit-turn', 'outsider', a)).status, 403);
  assert.equal((await f.call('get-state', 'outsider', { matchId })).status, 403);
  assert.equal((await f.call('submit-turn', 1, a)).body.resolved, undefined);
  assert.deepEqual(f.broadcasts, [['fixture', 2, 'round']]);
  assert.equal(f.reports.length, 0);
  const before = (await f.call('get-state', 2, { matchId })).body;
  assert.equal(before.latestRoundReport, null);
  assert.equal(before.opponent.hand, undefined);
  assert.equal(before.me.ready, false); assert.equal(before.opponent.ready, true);
  await f.call('submit-turn', 1, a); // idempotent replay before second player
  assert.equal(f.turns.length, 1);
  const result = await f.call('submit-turn', 2, b);
  assert.equal(result.status, 200); assert.equal(result.body.resolved, true);
  assert.equal(f.reports.length, 1); assert.equal(f.match.round, 2);
  assert.equal(f.reports[0].public_result.report[0].a.info.a, expected.attack);
  const va = (await f.call('get-state', 1, { matchId })).body;
  const vb = (await f.call('get-state', 2, { matchId })).body;
  assert.deepEqual(va.latestRoundReport, vb.latestRoundReport);
  assert.deepEqual(va.board.me.outer, vb.board.opponent.outer);
  assert.deepEqual(va.board.opponent.inner, vb.board.me.inner);
  assert.equal((await f.call('submit-turn', 2, b)).status, 409);
  assert.equal(f.reports.length, 1);
});

test('real submit handler rejects forged stats/actions/ownership and fortify, including replay', async () => {
  const f = serverFixture(), valid = turn(f, 1);
  for (const mutate of [
    t => t.attack = 999, t => t.action = 'fortify', t => t.fortifyLane = 0,
    t => t.placements[0].element = 'fire', t => t.placements[0].defense = 999,
    t => t.placements[0].attack[0] = { id: t.placements[0].attack[0], v: 999 },
    t => t.placements[0].attack[0] = 'alien',
    t => t.placements[0].attack[0] = t.placements[1].defense[0],
  ]) {
    const t = structuredClone(valid); mutate(t);
    assert.equal((await f.call('submit-turn', 1, t)).status, 400);
    assert.equal(f.turns.length, 0);
  }
  await f.call('submit-turn', 1, valid);
  assert.equal((await f.call('submit-turn', 1, { ...valid, fortifyLane: 1 })).status, 400);
  assert.equal(f.turns.length, 1);
});

test('real handlers: full PvP match reaches final report at the round limit or destruction', async () => {
  const f = serverFixture();
  for (let round = 1; round <= 45 && f.match.status !== 'finished'; round++) {
    const a = turn(f, 1), b = turn(f, 2);
    assert.equal((await f.call('submit-turn', 1, a)).status, 200);
    assert.equal((await f.call('submit-turn', 2, b)).status, 200);
  }
  assert.equal(f.match.status, 'finished');
  for (const seat of [1, 2]) {
    const v = (await f.call('get-state', seat, { matchId: 'fixture' })).body;
    assert.equal(v.latestRoundReport.report[0].round, f.match.round);
    assert.ok(['me', 'opponent', 'draw'].includes(v.winner));
  }
});

test('real submit handler: existing PvE mode resolves with a valid universal bot turn', async () => {
  const f = serverFixture(); f.match.state.botMatch = true;
  assert.equal((await f.call('submit-turn', 2, turn(f, 2))).status, 403);
  const r = await f.call('submit-turn', 1, turn(f, 1));
  assert.equal(r.status, 200); assert.equal(r.body.resolved, true);
  const used = f.reports[0].public_result.report.flatMap(row => row.b.ownPairs.flat().map(c => c.id));
  assert.equal(new Set(used).size, 12);
});
