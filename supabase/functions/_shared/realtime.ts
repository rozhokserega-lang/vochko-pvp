// Realtime-сигнал: публикуем ТОЛЬКО matchId/version/eventType (ADR-3).
// Клиент после сигнала запрашивает персональный get-state.
import { adminClient } from './auth.ts';

export async function broadcastState(matchId: string, version: number, eventType: string) {
  const client = adminClient();
  const channel = client.channel(`match:${matchId}`, { config: { broadcast: { self: false } } });
  await new Promise<void>((resolve) => channel.subscribe(() => resolve()));
  try {
    await channel.send({
      type: 'broadcast',
      event: 'state',
      payload: { matchId, version, eventType },
    });
  } finally {
    await client.removeChannel(channel);
  }
}
