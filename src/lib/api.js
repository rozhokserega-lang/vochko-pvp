import { supabase } from './supabase.js';

// Прямой fetch вместо functions.invoke: invoke маскирует тело ошибки
// («non-2xx status code»), а нам нужны коды room-not-found и т.п.
async function call(name, body = {}) {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `http-${r.status}`);
  return json;
}

const RU = {
  'room-not-found': 'Комната не найдена — проверь код',
  'room-unavailable': 'В комнате уже два игрока или она закрыта',
  'own-room': 'Это твоя же комната — заходи с другого устройства',
  'unauthorized': 'Сессия истекла — обнови страницу',
  'too many open rooms': 'Слишком много открытых комнат — попробуй через минуту',
};

export const api = {
  createRoom: (opts = {}) => call('create-room', opts),
  joinRoom: async (roomCode) => {
    try { return await call('join-room', { roomCode }); }
    catch (e) { throw new Error(RU[e.message] ?? 'Не удалось войти: ' + e.message); }
  },
  getState: (matchId) => call('get-state', { matchId }),
  submitTurn: (turn) => call('submit-turn', turn),
  rematch: (matchId) => call('rematch', { matchId }),
  leaveRoom: (matchId) => call('leave-room', { matchId }),
};
