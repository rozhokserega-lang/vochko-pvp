// Development-only host: existing client + real turn/state handlers + in-memory SQL.
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { serverFixture } from '../tests/server-fixture.mjs';
import { deal } from '../shared/cards.js';

export async function startLocalGame(port = 5185) {
  const rooms = new Map();
  const makeRoom = (owner, bot = false) => {
    const f = serverFixture({ dealHand: deal });
    const id = randomUUID(), code = id.replaceAll('-', '').slice(0, 6).toUpperCase();
    Object.assign(f.match, { id, room_code: code, status: bot ? 'planning' : 'waiting' });
    f.match.state.hands = { 1: deal(), 2: deal() };
    f.match.state.botMatch = bot;
    const room = { f, owner, guest: null, pending: Promise.resolve(), rematch: new Set() };
    rooms.set(id, room);
    return room;
  };
  const apiSource = `
    const user = localStorage.vochko_local_user ||= crypto.randomUUID();
    async function call(name,body={}){
      const r=await fetch('/__local/'+name,{method:'POST',headers:{'content-type':'application/json','x-local-user':user},body:JSON.stringify(body)});
      const data=await r.json();if(!r.ok)throw new Error(data.error);return data;
    }
    export const api={createRoom:(o={})=>call('create-room',o),joinRoom:roomCode=>call('join-room',{roomCode}),getState:matchId=>call('get-state',{matchId}),submitTurn:turn=>call('submit-turn',turn),rematch:matchId=>call('rematch',{matchId}),leaveRoom:matchId=>call('leave-room',{matchId})};`;
  const plugin = {
    name: 'local-game-only', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/').split('?')[0];
      if (path.endsWith('/src/lib/api.js')) return apiSource;
      if (path.endsWith('/src/lib/supabase.js')) return `export async function ensureSession(){return {access_token:'local'}};export function supabase(){return {}}`;
      if (path.endsWith('/src/lib/realtime.js')) return `
        import {api} from './api.js';
        export function watchMatch(id,cb){let active=true,last=null,busy=false;
          const timer=setInterval(async()=>{if(busy)return;busy=true;try{const v=await api.getState(id);if(active&&v.version!==last){last=v.version;cb()}}catch{}finally{busy=false}},800);
          return ()=>{active=false;clearInterval(timer)};
        }`;
    },
    configureServer(server) {
      server.middlewares.use('/__local', async (req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        const reply = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
        try {
          if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
          const user = req.headers['x-local-user'];
          if (typeof user !== 'string' || !user) return reply({ error: 'local session required' }, 401);
          let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 16000) return reply({ error: 'too large' }, 413); }
          const body = JSON.parse(text || '{}'), action = req.url.split('?')[0].slice(1);
          if (action === 'create-room') {
            const room = makeRoom(user, !!body.vsBot);
            return reply({ matchId: room.f.match.id, roomCode: room.f.match.room_code, seat: 1 });
          }
          if (action === 'join-room') {
            const room = [...rooms.values()].find(r => r.f.match.room_code === String(body.roomCode).toUpperCase());
            if (!room) return reply({ error: 'room-not-found' }, 404);
            if (room.owner === user) return reply({ error: 'own-room' }, 409);
            if (room.f.match.status !== 'waiting') return reply({ error: 'room-unavailable' }, 409);
            room.guest = user; room.f.match.status = 'planning'; room.f.match.version++;
            return reply({ matchId: room.f.match.id, seat: 2 });
          }
          const room = rooms.get(body.matchId);
          if (!room) return reply({ error: 'match not found' }, 404);
          const seat = room.owner === user ? 1 : room.guest === user ? 2 : 0;
          if (!seat) return reply({ error: 'not a participant' }, 403);
          if (action === 'leave-room') return reply({ ok: true });
          if (action === 'rematch') {
            if (room.f.match.status !== 'finished') return reply({ error: 'match not finished' }, 409);
            room.rematch.add(seat);
            if (!room.f.match.state.botMatch && room.rematch.size < 2) return reply({ waiting: true });
            let next = rooms.get(room.f.match.state.nextMatchId);
            if (!next) {
              next = makeRoom(room.owner, room.f.match.state.botMatch); next.guest = room.guest;
              next.f.match.status = 'planning'; room.f.match.state.nextMatchId = next.f.match.id; room.f.match.version++;
            }
            return reply({ waiting: false, matchId: next.f.match.id, roomCode: next.f.match.room_code });
          }
          if (!['get-state', 'submit-turn'].includes(action)) return reply({ error: 'unknown action' }, 404);
          // Serialize mutations, just as the production handler's FOR UPDATE does.
          const run = room.pending.then(() => room.f.call(action, seat, body));
          room.pending = run.catch(() => {});
          const result = await run;
          if (action === 'get-state') result.body.opponent.connected = !!room.guest || !!room.f.match.state.botMatch;
          reply(result.body, result.status);
        } catch (error) { reply({ error: error.message }, 400); }
      });
    },
  };
  const server = await createServer({ base: '/', plugins: [plugin], server: { host: '127.0.0.1', port, strictPort: true } });
  await server.listen();
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startLocalGame();
  console.log('Локальная игра: http://127.0.0.1:5185/ — бот или PvP в двух профилях. Матчи хранятся в памяти до остановки сервера.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
}
