// submit-turn: валидация хода, идемпотентный приём, атомарный resolve.
// PvE: бот играет seat 2 внутри той же транзакции (shared/bot.js).
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { broadcastState } from '../_shared/realtime.ts';
import { dealHand } from '../_shared/deal.ts';
import { validateTurn, materializeTurn } from '../../../shared/validation.js';
import { botPlan, choosePlan } from '../../../shared/bot.js';
import { resolveRound } from '../../../shared/engine.js';
import { RECOMMENDED } from '../../../shared/abilities.js';
import { mulberry32 } from '../../../shared/rng.js';
import { cryptoSeed } from '../_shared/deal.ts';
import {chooseCorePlan} from '../../../shared/core-bot.js';
import {coreDescriptor,nextCoreHands} from '../../../shared/nexus-core.js';
import {settleDeckHand,drawDeckHand,deckKnowledge,exhaustionWinner} from '../../../shared/player-deck.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { matchId, round, placements, fortifyLane, coreCardId } = body ?? {};
    if (!matchId) throw new HttpError('matchId required');

    const result = await sql.begin(async (tx) => {
      const [m] = await tx`select * from private.matches where id = ${matchId} for update`;
      if (!m) throw new HttpError('match not found', 404);
      const seat = user.id === m.player1_id ? 1 : user.id === m.player2_id ? 2 : 0;
      if (!seat || (m.state?.botMatch && seat !== 1)) throw new HttpError('not a participant', 403);
      if (m.status !== 'planning') throw new HttpError('match is not in planning', 409);
      if (round !== m.round) throw new HttpError(`stale round: current ${m.round}`, 409);

      const st = m.state ?? {};
      const coreEnabled=st.rules?.nexusCoreEnabled===true;
      if(coreEnabled&&coreCardId&&(st.decks?.[seat]?.burnedCards??st.coreExclusions?.[seat]??[]).includes(coreCardId))throw new HttpError('Эта карта сожжена или исключена из текущей раздачи',400);
      const { matchId: _id, round: _round, expectedVersion: _version, ...turn } = body;
      const check = validateTurn(st.hands?.[String(seat)] ?? [], turn,{nexusCoreEnabled:coreEnabled});
      if (!check.ok) throw new HttpError(check.error ?? 'invalid turn', 400);
      if(coreEnabled){
        const prep=st.corePreparations?.[seat];
        if(!prep?.coreCardId||prep.coreCardId!==coreCardId||JSON.stringify(prep.placements)!==JSON.stringify([...placements].sort((a,b)=>a.lane-b.lane)))
          throw new HttpError('Сначала подтверди расстановку и карту Ядра',409);
      }

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

      // Единый движок: способности/контрстихии по правилам матча.
      // Рекомендованный баланс включён по умолчанию для новых матчей
      // (rules.variants); A/B — передать исходные значения в rules.variants.
      const rules = st.rules ?? {};
      const abilities = rules.abilities === true;
      const counters = rules.counters !== false; // утверждённая механика: вкл для новых матчей
      const variants = rules.variants ?? RECOMMENDED;

      const resolveAndStore = async (turnA, turnB) => {
        const board = { round: m.round, a: st.board.a, b: st.board.b };
        // Seeded RNG → воспроизводимый расчёт раунда (seed хранится в state).
        const rng = mulberry32(Number(st.rngSeed) >>> 0);
        st.rngSeed = cryptoSeed(); // новый seed на следующий раунд
        const resolved = resolveRound(board, turnA, turnB, { abilities, counters, variants, rng,nexusCoreEnabled:coreEnabled,coreProfile:rules.coreProfile });
        st.board = { a: board.a, b: board.b };

        st.fortifyUsed = { 1: false, 2: false }; // неактивное поле совместимости

        let finished = resolved.finished;
        if(coreEnabled&&rules.deckVersion===2){
          const a=settleDeckHand(st.decks[1],st.hands[1],turnA),b=settleDeckHand(st.decks[2],st.hands[2],turnB);
          st.decks={1:a,2:b};st.hands={1:[],2:[]};
          if(!finished){
            const nextRng=mulberry32(Number(st.rngSeed)>>>0),da=drawDeckHand(a,nextRng),db=drawDeckHand(b,nextRng);
            if(da.exhausted||db.exhausted){finished=true;resolved.finished=true;resolved.winner=exhaustionWinner(board);st.endReason='deck_exhaustion';}
            else {st.decks={1:da.deck,2:db.deck};st.hands={1:da.hand,2:db.hand};}
          }
        }
        const newRound = finished ? m.round : m.round + 1;
        if (!finished&&rules.deckVersion!==2) st.hands = coreEnabled?nextCoreHands(mulberry32(Number(st.rngSeed)>>>0),{a:turnA.coreCard,b:turnB.coreCard}):{ 1: dealHand(), 2: dealHand() };
        const cores=coreEnabled?{a:coreDescriptor(turnA.coreCard),b:coreDescriptor(turnB.coreCard)}:null;
        if(coreEnabled){if(rules.deckVersion!==2)st.coreExclusions={1:[turnA.coreCard.id],2:[turnB.coreCard.id]};st.corePreparations={};}

        await tx`
          insert into private.round_events (match_id, round, public_result)
          values (${m.id}, ${m.round}, ${sql.json({ events: resolved.events, report: resolved.report, abilityEvents: resolved.abilityEvents ?? null,...(cores?{cores,coreEffects:resolved.coreEffects??[],coreProfile:rules.coreProfile??'balanced'}:{}) })})`;

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
        // smartBot (правила матча) — Monte Carlo бот; иначе прежний botPlan.
        const matchState = { round: m.round, a: st.board.a, b: st.board.b };
        const botTurn = coreEnabled?chooseCorePlan({state:matchState,hand:st.hands['2'],side:'b',rng:mulberry32(Number(st.rngSeed)>>>0),variants,counters,coreProfile:rules.coreProfile,
          ownDeck:rules.deckVersion===2?deckKnowledge(st.decks[2]):null,opponentBurned:st.decks?.[1]?.burnedCards??[],opponentDeckCounts:st.decks?.[1]?{draw:st.decks[1].drawPile.length,discard:st.decks[1].discardPile.length}:null}).plan:(st.rules?.smartBot === true)
          ? choosePlan({
              state: matchState, hand: st.hands['2'], side: 'b', rng: mulberry32(Number(st.rngSeed) >>> 0),
              budgetMs: 800, counters, variants,
            }).plan
          : { placements: botPlan(st.hands['2'], st.board.a, st.board.b), fortifyLane: null };
        return await resolveAndStore(
          materializeTurn(st.hands['1'], { placements, fortifyLane,...(coreEnabled?{coreCardId}:{}) },{nexusCoreEnabled:coreEnabled}),
          botTurn,
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
        materializeTurn(st.hands['1'], { placements: t1.placements, fortifyLane: null,...(coreEnabled?{coreCardId:st.corePreparations[1].coreCardId}:{}) },{nexusCoreEnabled:coreEnabled}),
        materializeTurn(st.hands['2'], { placements: t2.placements, fortifyLane: null,...(coreEnabled?{coreCardId:st.corePreparations[2].coreCardId}:{}) },{nexusCoreEnabled:coreEnabled}),
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
