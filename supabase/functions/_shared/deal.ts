// Серверная раздача: доверенный источник случайности (README §6 — Math.random
// клиента запрещён). Используем crypto.getRandomValues.
import { deck, shuffled, deal } from '../../../shared/cards.js';
import { dealCoreHand } from '../../../shared/nexus-core.js';

export function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

// Рука раунда: 7 красных + 7 чёрных из перемешанной колоды (правила v1.5).
export function dealHand(nexusCoreEnabled=false,excluded=[]) {
  return nexusCoreEnabled?dealCoreHand(cryptoRng,excluded):deal(cryptoRng);
}

// Seed раунда: сохраняется в state.matches → воспроизводимый resolve (аудит).
export function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

// Код комнаты: криптостойкий, без похожих символов (README §4).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function roomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const emptyBoard = () => ({
  a: { nexus: 80, outer: [12, 12, 12], inner: [18, 18, 18], burn: [0, 0, 0], statuses: [{}, {}, {}] },
  b: { nexus: 80, outer: [12, 12, 12], inner: [18, 18, 18], burn: [0, 0, 0], statuses: [{}, {}, {}] },
});
