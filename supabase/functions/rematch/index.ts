// rematch: оба игрока подтверждают — создаётся новая партия с чистыми HP
// (README §6.9). Комната получает НОВЫЙ код; старый матч остаётся со ссылкой.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { emptyBoard, roomCode,dealMatchCards } from '../_shared/deal.ts';
import { broadcastState } from '../_shared/realtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const { matchId } = await req.json();
    if (!matchId) throw new HttpError('matchId required');

    const next = await sql.begin(async (tx) => {
      const [m] = await tx`select * from private.matches where id = ${matchId} for update`;
      if (!m) throw new HttpError('match not found', 404);
      const seat = user.id === m.player1_id ? 1 : user.id === m.player2_id ? 2 : 0;
      if (!seat) throw new HttpError('not a participant', 403);
      if (m.status !== 'finished') throw new HttpError('match is not finished', 409);

      const st = m.state ?? {};
      if(st.nextMatchId)return {waiting:false,matchId:st.nextMatchId,version:1,sourceVersion:Number(m.version)};
      st.rematchWants = { ...st.rematchWants, [seat]: true };
      if(st.botMatch)st.rematchWants[2]=true;
      if (!(st.rematchWants[1] && st.rematchWants[2])) {
        await tx`update private.matches set state = ${sql.json(st)}, updated_at = now() where id = ${m.id}`;
        await tx`update private.matches set version = version + 1 where id = ${m.id}`;
        return { waiting: true };
      }

      // Оба согласны — новая партия, новый код комнаты.
      const nextRules={...st.rules,...(st.rules?.nexusCoreEnabled?{deckVersion:2}:{})};
      const [created] = await tx`
        insert into private.matches (room_code, player1_id, player2_id, status, round, state)
        values (${roomCode()}, ${m.player1_id}, ${m.player2_id}, 'planning', 1, ${sql.json({
          board: emptyBoard(),
          ...dealMatchCards(nextRules),
          rules:nextRules,rngSeed:st.rngSeed,
          fortifyUsed: { 1: false, 2: false },
          botMatch: !!st.botMatch, // реванш с ботом остаётся PvE
        })})
        returning id, room_code, version`;
      st.nextMatchId = created.id;
      const sourceVersion=Number(m.version)+1;
      await tx`update private.matches set state = ${sql.json(st)}, version = version + 1, updated_at = now() where id = ${m.id}`;
      return { waiting: false, matchId: created.id, roomCode: created.room_code, version: created.version,sourceVersion };
    });

    if (!next.waiting) {
      await broadcastState(matchId, next.sourceVersion, 'rematch');
      await broadcastState(next.matchId, next.version, 'joined');
    }
    return json(next);
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
