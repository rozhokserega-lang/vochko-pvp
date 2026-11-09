// leave-room: игрок уходит. ADR-2 — окно реконнекта 10 минут (expires_at
// сокращается), матч для соперника выглядит как «соперник отключился».
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { broadcastState } from '../_shared/realtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const { matchId } = await req.json();
    if (!matchId) throw new HttpError('matchId required');

    const rows = await sql`
      update private.matches
         set state = state || jsonb_build_object('leftSeat',
               case when ${user.id} = player1_id then 1 else 2 end),
             expires_at = least(expires_at, now() + interval '10 minutes'),
             version = version + 1,
             updated_at = now()
       where id = ${matchId}
         and ${user.id} in (player1_id, player2_id)
         and status <> 'finished'
       returning id, version`;
    if (!rows.length) throw new HttpError('nothing to leave', 404);

    await broadcastState(matchId, rows[0].version, 'left');
    return json({ ok: true });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
