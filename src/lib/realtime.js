import { supabase } from './supabase.js';

// Слушатель broadcast-событий комнаты. Пейлоад содержит только
// {matchId, version, eventType} (ADR-3) — состояние подтягиваем get-state.
export function watchMatch(matchId, onChange) {
  return createMatchWatcher(supabase(),matchId,onChange);
}

export function createMatchWatcher(client,matchId,onChange,host=globalThis) {
  let active=true,busy=false;
  const sync=async(payload)=>{
    if(!active||busy)return;
    busy=true;
    try{await onChange(payload);}catch{/* Transient failures recover on the next poll/reconnect. */}
    finally{busy=false;}
  };
  const channel = client
    .channel(`match:${matchId}`, { config: { broadcast: { self: true } } })
    .on('broadcast', { event: 'state' }, ({ payload }) => sync(payload));
  channel.subscribe(status=>{if(status==='SUBSCRIBED')sync();});
  const timer=host.setInterval(()=>sync(),5000);
  const wake=()=>sync();
  host.addEventListener?.('online',wake);host.addEventListener?.('focus',wake);
  host.document?.addEventListener('visibilitychange',wake);
  return ()=>{
    active=false;host.clearInterval(timer);
    host.removeEventListener?.('online',wake);host.removeEventListener?.('focus',wake);
    host.document?.removeEventListener('visibilitychange',wake);
    Promise.resolve(client.removeChannel(channel)).catch(()=>{});
  };
}
