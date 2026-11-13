import { supabase } from './supabase.js';

// Слушатель broadcast-событий комнаты. Пейлоад содержит только
// {matchId, version, eventType} (ADR-3) — состояние подтягиваем get-state.
export function watchMatch(matchId, onChange, {onConnectionChange=()=>{}}={}) {
  return createMatchWatcher(supabase(),matchId,onChange,globalThis,onConnectionChange);
}

export function createMatchWatcher(client,matchId,onChange,host=globalThis,onConnectionChange=()=>{}) {
  let active=true,busy=false;
  const sync=async(payload)=>{
    if(!active||busy)return;
    busy=true;
    try{await onChange(payload);if(active)onConnectionChange('online');}catch{if(active)onConnectionChange(host.navigator?.onLine===false?'offline':'error');}
    finally{busy=false;}
  };
  const channel = client
    .channel(`match:${matchId}`, { config: { broadcast: { self: true } } })
    .on('broadcast', { event: 'state' }, ({ payload }) => sync(payload));
  channel.subscribe(status=>{if(status==='SUBSCRIBED')sync();else if(active&&['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))onConnectionChange(host.navigator?.onLine===false?'offline':'error');});
  const timer=host.setInterval(()=>sync(),5000);
  const wake=()=>sync();
  const offline=()=>{if(active)onConnectionChange('offline');};
  host.addEventListener?.('offline',offline);
  host.addEventListener?.('online',wake);host.addEventListener?.('focus',wake);
  host.document?.addEventListener('visibilitychange',wake);
  return ()=>{
    active=false;host.clearInterval(timer);
    host.removeEventListener?.('online',wake);host.removeEventListener?.('focus',wake);
    host.removeEventListener?.('offline',offline);
    host.document?.removeEventListener('visibilitychange',wake);
    Promise.resolve(client.removeChannel(channel)).catch(()=>{});
  };
}
