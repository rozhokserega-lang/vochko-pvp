// create-room: создаёт комнату, вызывающий становится seat 1.
import { requireUser } from '../_shared/auth.ts';
import { json, err, cors, HttpError } from '../_shared/cors.ts';
import { sql } from '../_shared/db.ts';
import { roomCode } from '../_shared/deal.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requireUser(req);
    const { vsBot, abilities, smartBot } = await req.json().catch(() => ({}));
    // Старые waiting-комнаты игрока закрываем: они бессмысленны после ухода.
    await sql`
      update private.matches set status = 'finished', updated_at = now()
       where player1_id = ${user.id} and status = 'waiting'`;
    // Анти-спам: не больше 10 открытых комнат на игрока (защита на случай гонок).
    const [{ count }] = await sql`
      select count(*)::int as count from private.matches
       where player1_id = ${user.id} and status = 'waiting'`;
    if (count >= 10) throw new HttpError('too many open rooms', 429);

    const code = roomCode();
    // PvE: комната сразу в planning, бот играет seat 2 на сервере.
    const state = vsBot
      ? {
          botMatch: true,
          board: emptyBoard(),
          hands: { 1: dealHand(), 2: dealHand() },
          fortifyUsed: { 1: false, 2: false },
          rules: { abilities: abilities !== false, smartBot: smartBot !== false, counters: counters !== false },
          rngSeed: cryptoSeed(),
        }
      : {
          rules: { abilities: abilities !== false, smartBot: false, counters: counters !== false },
          rngSeed: cryptoSeed(),
        };
    const [match] = await sql`
      insert into private.matches (room_code, player1_id, status, state)
      values (${code}, ${user.id}, ${vsBot ? 'planning' : 'waiting'}, ${sql.json(state)})
      returning id, room_code`;
    return json({ matchId: match.id, roomCode: match.room_code, seat: 1, vsBot: !!vsBot });
  } catch (e) {
    return err(e?.message ?? 'error', e instanceof HttpError ? e.status : 500);
  }
});
