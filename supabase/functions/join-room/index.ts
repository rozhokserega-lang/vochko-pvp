// join-room: вход по коду комнаты. Атомарно занимает seat 2 — третий игрок не пройдёт.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { dealHand, emptyBoard } from '../_shared/deal.ts';
import { broadcastState } from '../_shared/realtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const code = String((await req.json()).roomCode ?? '').trim().toUpperCase();

    // Понятные коды ошибок: клиент показывает человеческий текст.
    const [m] = await sql`select * from private.matches where room_code = ${code}`;
    if (!m) throw new HttpError('room-not-found', 404);
    if (m.state?.botMatch) throw new HttpError('room-unavailable', 409);
    if (m.player1_id === user.id) throw new HttpError('own-room', 409);
    if (m.status !== 'waiting' || m.player2_id) throw new HttpError('room-unavailable', 409);

    // Атомарный захват второго места: условие в UPDATE, а не в приложении.
    const joined = await sql`
      update private.matches
         set player2_id = ${user.id},
             status = 'planning',
             round = 1,
             version = version + 1,
             state = ${sql.json({
               ...m.state,
               board: emptyBoard(),
               hands: { 1: dealHand(m.state?.rules?.nexusCoreEnabled===true), 2: dealHand(m.state?.rules?.nexusCoreEnabled===true) },
               fortifyUsed: { 1: false, 2: false },
             })},
             updated_at = now()
       where id = ${m.id}
         and status = 'waiting'
         and player2_id is null
         and player1_id <> ${user.id}
       returning id, version`;
    if (!joined.length) throw new HttpError('room-unavailable', 409);

    const match = joined[0];
    await broadcastState(match.id, match.version, 'joined');
    return json({ matchId: match.id, seat: 2 });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
