import { supabase } from './supabase.js';

// Все операции — POST в Edge Functions; identity в JWT, не в теле.
async function call(name, body = {}) {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

export const api = {
  createRoom: () => call('create-room'),
  joinRoom: (roomCode) => call('join-room', { roomCode }),
  getState: (matchId) => call('get-state', { matchId }),
  submitTurn: (turn) => call('submit-turn', turn),
  rematch: (matchId) => call('rematch', { matchId }),
  leaveRoom: (matchId) => call('leave-room', { matchId }),
};
