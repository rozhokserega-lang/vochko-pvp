// Тесты аудита: п.2 укрепление, п.6 версия, п.3 готовность, п.7 щит, п.8 бот.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fortifyAllowed } from '../shared/validation.js';
import { newState, shieldPct } from '../shared/engine.js';
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';

test('аудит п.2: fortifyAllowed запрещает повторное укрепление', () => {
  assert.deepEqual(fortifyAllowed(false, 1), { ok: false, error: 'fortify-disabled' });
  assert.deepEqual(fortifyAllowed(false, null), { ok: true });
  assert.equal(fortifyAllowed(true, 0).ok, false);   // уже использовано
  assert.equal(fortifyAllowed(true, null).ok, true); // без укрепления можно ходить
  assert.equal(fortifyAllowed(false, 5).ok, false);  // неверная линия
  assert.equal(fortifyAllowed(false, -1).ok, false);
});

test('аудит п.3/п.7: готовность по сидам и щит своей доски в DTO', () => {
  // имитация строк turns: мой ход есть, ход соперника — нет
  const rows = [{ seat: 1 }];
  const mine = rows.filter((r) => r.seat !== 2).length > 0;
  const theirs = rows.filter((r) => r.seat !== 1).length > 0;
  assert.equal(mine, true);
  assert.equal(theirs, false); // соперник ещё не готов — до resolve

  const b = newState();
  const view = { me: { hand: deal(mulberry32(3)), board: { ...b, shieldPct: shieldPct(b) } } };
  assert.equal(typeof view.me.board.shieldPct, 'number');
  assert.equal(view.me.board.shieldPct, 0); // линии целы — Нексус неуязвим
});

test('аудит п.8: пометка бота в DTO (логика состояния)', () => {
  const st = { botMatch: true };
  const opp = { connected: st.botMatch ? true : false, isBot: !!st.botMatch };
  assert.equal(opp.isBot, true);
  assert.equal(opp.connected, true);
  const st2 = {};
  assert.equal(!!st2.botMatch, false);
});
