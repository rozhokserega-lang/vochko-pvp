// submit-turn: валидация хода, идемпотентный приём, атомарный resolve.
// PvE: бот играет seat 2 внутри той же транзакции (shared/bot.js).
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { broadcastState } from '../_shared/realtime.ts';
import { dealHand } from '../_shared/deal.ts';
import { validateTurn, materializeTurn } from '../../../shared/validation.js';
import { botPlan } from '../../../shared/bot.js';
import { resolveRound } from '../../../shared/engine.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { matchId, round, placements, fortifyLane } = body ?? {};
    if (!matchId) throw new HttpError('matchId required');

    const result = await sql.begin(async (tx) => {
      const [m] = await tx`select * from private.matches where id = ${matchId} for update`;
      if (!m) throw new HttpError('match not found', 404);
      const seat = user.id === m.player1_id ? 1 : user.id === m.player2_id ? 2 : 0;
      if (!seat || (m.state?.botMatch && seat !== 1)) throw new HttpError('not a participant', 403);
      if (m.status !== 'planning') throw new HttpError('match is not in planning', 409);
      if (round !== m.round) throw new HttpError(`stale round: current ${m.round}`, 409);

      const st = m.state ?? {};
      const { matchId: _id, round: _round, expectedVersion: _version, ...turn } = body;
      const check = validateTurn(st.hands?.[String(seat)] ?? [], turn);
      if (!check.ok) throw new HttpError(check.error ?? 'invalid turn', 400);

      // Идемпотентность важнее версии: повторный submit возвращает прежнее
      // подтверждение, даже если version уже уехал вперёд (README §6.8).
      const existing = await tx`
        select 1 from private.turns
         where match_id = ${m.id} and round = ${m.round} and player_id = ${user.id}`;
      if (existing.length) return { accepted: true, version: Number(m.version), ready: true };

      await tx`
        insert into private.turns (match_id, round, player_id, seat, placements, fortify_lane)
        values (${m.id}, ${m.round}, ${user.id}, ${seat},
                ${sql.json(placements)}, ${null})`;

      const resolveAndStore = async (turnA, turnB) => {
        const board = { round: m.round, a: st.board.a, b: st.board.b };
        const resolved = resolveRound(board, turnA, turnB);
        st.board = { a: board.a, b: board.b };

        st.fortifyUsed = { 1: false, 2: false }; // неактивное поле совместимости

        const finished = resolved.finished;
        const newRound = finished ? m.round : m.round + 1;
        if (!finished) st.hands = { 1: dealHand(), 2: dealHand() };

        await tx`
          insert into private.round_events (match_id, round, public_result)
          values (${m.id}, ${m.round}, ${sql.json({ events: resolved.events, report: resolved.report })})`;

        await tx`
          update private.matches
             set state = ${sql.json(st)},
                 round = ${newRound},
                 version = version + 1,
                 status = ${finished ? 'finished' : 'planning'},
                 winner_seat = ${finished ? (resolved.winner === 'a' ? 1 : resolved.winner === 'b' ? 2 : null) : null},
                 updated_at = now()
           where id = ${m.id}
          returning version`;

        return {
          accepted: true,
          ready: true,
          resolved: true, // семантика: раунд РАССЧИТАН (не путать с концом матча)
          finished,       // матч завершён целиком
          events: resolved.events,
          winner: resolved.winner,
        };
      };

      if (st.botMatch) {
        // PvE: бот играет seat 2 в той же транзакции — расчёт мгновенный.
        return await resolveAndStore(
          materializeTurn(st.hands['1'], { placements, fortifyLane }),
          { placements: botPlan(st.hands['2'], st.board.a, st.board.b), fortifyLane: null },
        );
      }

      const [{ count }] = await tx`
        select count(*)::int as count from private.turns
         where match_id = ${m.id} and round = ${m.round}`;
      if (count < 2) {
        await tx`update private.matches set version = version + 1, updated_at = now() where id = ${m.id}`;
        return { accepted: true, version: Number(m.version) + 1, ready: false };
      }

      // Второе подтверждение — единственный расчёт раунда.
      const rows = await tx`
        select seat, placements, fortify_lane from private.turns
         where match_id = ${m.id} and round = ${m.round}`;
      const bySeat = new Map(rows.map((r) => [r.seat, r]));
      const t1 = bySeat.get(1)!, t2 = bySeat.get(2)!;
      return await resolveAndStore(
        materializeTurn(st.hands['1'], { placements: t1.placements, fortifyLane: null }),
        materializeTurn(st.hands['2'], { placements: t2.placements, fortifyLane: null }),
      );
    });

    // Notify the opponent after the first confirmation as well as after resolve.
    if (result.accepted) {
      const [m] = await sql`select version from private.matches where id = ${matchId}`;
      await broadcastState(matchId, Number(m.version), 'round');
    }
    return json(result);
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
