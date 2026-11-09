import { supabase } from './supabase.js';

// Слушатель broadcast-событий комнаты. Пейлоад содержит только
// {matchId, version, eventType} (ADR-3) — состояние подтягиваем get-state.
export function watchMatch(matchId, onChange) {
  const channel = supabase()
    .channel(`match:${matchId}`, { config: { broadcast: { self: true } } })
    .on('broadcast', { event: 'state' }, ({ payload }) => onChange(payload));
  channel.subscribe();
  return () => supabase().removeChannel(channel);
}
