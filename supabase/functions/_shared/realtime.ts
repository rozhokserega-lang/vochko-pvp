// Realtime-сигнал: публикуем ТОЛЬКО matchId/version/eventType (ADR-3).
// Клиент после сигнала запрашивает персональный get-state.
export async function broadcastState(matchId: string, version: number, eventType: string) {
  // A committed turn must not fail or hang because a WebSocket subscription
  // or notification is unavailable. Clients also reconcile via get-state.
  try {
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`,{
      method:'POST',signal:AbortSignal.timeout(2500),
      headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{topic:`match:${matchId}`,event:'state',private:false,payload:{matchId,version:Number(version),eventType}}]}),
    });
    if(!response.ok)console.warn('Realtime notification failed',response.status);
  } catch {console.warn('Realtime notification unavailable; clients will reconcile');}
}
