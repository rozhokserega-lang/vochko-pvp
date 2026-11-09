// get-state: персонализированный DTO (README §5). До разрешения раунда карты
// соперника и его раскладка не покидают сервер — ни в каком виде.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { shieldPct } from '../../../shared/engine.js';

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
        count(*)::int as total
      from private.turns where match_id = ${m.id} and round = ${m.round}`;
    const ready = readyRow.total >= 2;

    const [report] = await sql`
      select public_result from private.round_events
       where match_id = ${m.id} and round = ${m.round - 1}`;

    return json({
      matchId: m.id,
      roomCode: m.room_code,
      seat,
      status: m.status,
      round: m.round,
      version: Number(m.version),
      me: {
        hand: st.hands?.[String(seat)] ?? [],
        ready: readyRow.mine > 0,
        fortifyUsed: st.fortifyUsed?.[String(seat)] ?? false,
      },
      opponent: {
        connected: (seat === 1 ? m.player2_id : m.player1_id) != null,
        ready: m.status === 'planning' ? ready : false,
        fortifyUsed: st.fortifyUsed?.[String(seat === 1 ? 2 : 1)] ?? false,
      },
      board: {
        me: myBoard ?? null, // своя доска целиком, включая burn
        opponent: oppBoard ? { nexus: oppBoard.nexus, outer: oppBoard.outer, inner: oppBoard.inner, shieldPct: shieldPct(oppBoard) } : null,
      },
      latestRoundReport: report?.public_result ?? null,
      winner: m.status === 'finished' ? (m.winner_seat == null ? 'draw' : m.winner_seat === seat ? 'me' : 'opponent') : null,
      canRematch: m.status === 'finished',
    });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
