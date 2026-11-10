// Офлайн-рендер арены v20 теми же координатами, что накладывает
// ArenaScene.applyArenaLayout(): bg 1600×900 + 12 башен + 2 Нексуса.
import sharp from 'sharp';
import * as L from '../src/ui/arena/arenaLayout.js';
import { ARENA_ASSETS } from '../src/ui/arena/arena-assets.js';

const W = L.ARENA_DESIGN.w, H = L.ARENA_DESIGN.h;
const layers = [];
for (const t of L.LAYOUT.towers) {
  const [_, team, kind, lane, size] = t.id.split('-');
  const box = L.towerBox(team, kind, +lane, size, 'full');
  const artKey = `tower${team === 'ally' ? 'Ally' : 'Enemy'}Full`;
  const resized = await sharp(Buffer.from(ARENA_ASSETS[artKey].split(',')[1], 'base64'))
    .resize(Math.round(box.w), Math.round(box.h)).png().toBuffer();
  layers.push({ input: resized, left: Math.round(box.cx - box.w / 2), top: Math.round(box.bottom - box.h) });
}
for (const side of ['ally', 'enemy']) {
  const box = L.nexusBox(side);
  const resized = await sharp(Buffer.from(ARENA_ASSETS[side === 'ally' ? 'nexusAlly' : 'nexusEnemy'].split(',')[1], 'base64'))
    .resize(Math.round(box.w), Math.round(box.h)).png().toBuffer();
  layers.push({ input: resized, left: Math.round(box.cx - box.w / 2), top: Math.round(box.bottom - box.h) });
}
const bg = await sharp(Buffer.from(ARENA_ASSETS.bg.split(',')[1], 'base64')).resize(W, H, { fit: 'fill' }).png().toBuffer();
await sharp(bg).composite(layers).png().toFile('D:/Rotogochi/.local-tools/arena-scene-mock.png');
console.log('ok');
