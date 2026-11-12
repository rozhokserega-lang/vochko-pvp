import { supabase } from './supabase.js';
// Broadcasts are hints. A periodic read and reconnect/focus read recover missed hints.
export function watchMatch(matchId, onChange) {
  let active=true, busy=false, queued=false;
  const refresh=async()=>{
    if(!active)return;
    if(busy){queued=true;return;}
    busy=true;
    try{await onChange({matchId});}catch{ /* transient offline: retry on reconnect/timer */ }
    finally{busy=false;if(queued&&active){queued=false;void refresh();}}
  };
  const client=supabase();
  const channel=client.channel(`match:${matchId}`,{config:{broadcast:{self:true}}})
    .on('broadcast',{event:'state'},refresh);
  channel.subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  const timer=setInterval(refresh,8000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('online',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);client.removeChannel(channel);};
}
