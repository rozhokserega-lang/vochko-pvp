// get-state: персонализированный DTO (README §5). До разрешения раунда карты
// соперника и его раскладка не покидают сервер — ни в каком виде.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { shieldPct } from '../../../shared/engine.js';
import {coreDescriptor} from '../../../shared/nexus-core.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const { matchId } = await req.json();
    const [m] = await sql`
      select * from private.matches where id = ${matchId ?? ''}`;
    if (!m) throw new HttpError('match not found', 404);
    const seat = user.id === m.player1_id ? 1 : user.id === m.player2_id ? 2 : 0;
    if (!seat) throw new HttpError('not a participant', 403);

    const st = m.state ?? {};
    const myBoard = seat === 1 ? st.board?.a : st.board?.b;
    const oppBoard = seat === 1 ? st.board?.b : st.board?.a;
    const [readyRow] = await sql`
      select
        count(*) filter (where player_id = ${user.id})::int as mine,
        count(*) filter (where seat <> ${seat})::int as theirs
      from private.turns where match_id = ${m.id} and round = ${m.round}`;

    // Отчёт последнего раунда. При ФИНАЛЕ submit-turn НЕ увеличивает round
    // (матч завершается на текущем номере), поэтому public_result финального
    // боя хранится с round = m.round, а не m.round - 1. Без этой поправки
    // клиент не получает финальный отчёт и показывает окно победы/поражения
    // сразу, пропуская анимацию последнего удара.
    const finished = m.status === 'finished';
    const reportRound = finished ? m.round : m.round - 1;

    const [report] = await sql`
      select public_result from private.round_events
       where match_id = ${m.id} and round = ${reportRound}`;

    return json({
      matchId: m.id,
      roomCode: m.room_code,
      seat,
      status: m.status,
      round: m.round,
      version: Number(m.version),
      rules:{nexusCoreEnabled:st.rules?.nexusCoreEnabled===true,coreProfile:st.rules?.coreProfile??'balanced',variants:st.rules?.variants??{}},
      me: {
        userId: user.id,
        hand: st.hands?.[String(seat)] ?? [],
        ready: readyRow.mine > 0,
        fortifyUsed: false,
        ...(st.rules?.nexusCoreEnabled===true?{
          preparation:st.corePreparations?.[seat]??null,
          phase:readyRow.mine>0?'ready':st.corePreparations?.[seat]?.phase??'placement',
          core:coreDescriptor((st.hands?.[String(seat)]??[]).find(c=>c.id===st.corePreparations?.[seat]?.coreCardId)),
          excludedCards:st.coreExclusions?.[seat]??[],
        }:{}),
      },
      opponent: {
        connected: st.botMatch ? true : (seat === 1 ? m.player2_id : m.player1_id) != null,
        isBot: !!st.botMatch,
        ready: readyRow.theirs > 0,
        fortifyUsed: false,
      },
      board: {
        me: myBoard ? { ...myBoard, shieldPct: shieldPct(myBoard) } : null,
        opponent: oppBoard ? { nexus: oppBoard.nexus, outer: oppBoard.outer, inner: oppBoard.inner, statuses: oppBoard.statuses ?? [{}, {}, {}], shieldPct: shieldPct(oppBoard) } : null,
      },
      latestRoundReport: report?.public_result ?? null,
      winner: m.status === 'finished' ? (m.winner_seat == null ? 'draw' : m.winner_seat === seat ? 'me' : 'opponent') : null,
      canRematch: m.status === 'finished',
      nextMatchId: st.nextMatchId ?? null,
    });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
