// create-room: создаёт комнату, вызывающий становится seat 1.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { roomCode } from '../_shared/deal.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    // Анти-спам: не больше 10 открытых комнат на игрока.
    const [{ count }] = await sql`
      select count(*)::int as count from private.matches
       where player1_id = ${user.id} and status = 'waiting'`;
    if (count >= 10) throw new HttpError('too many open rooms', 429);

    const code = roomCode();
    const [match] = await sql`
      insert into private.matches (room_code, player1_id, state)
      values (${code}, ${user.id}, ${sql.json({})})
      returning id, room_code`;
    return json({ matchId: match.id, roomCode: match.room_code, seat: 1 });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
