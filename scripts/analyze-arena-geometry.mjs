// Пиксельный анализ геометрии: центры платформ фона, слоты карт и круги
// стихий на спрайтах башен/нексусов. Результат — относительные координаты
// для src/ui/arena/arenaLayout.js.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import os from 'node:os';

const SRC_DIR = process.argv[2] || path.join(os.homedir(), 'Downloads', 'ресурсы');
const A = 'src/ui/arena/assets';

const raw = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
};

// Компоненты связности на маске (4-соседство), с минимальной площадью.
function components(mask, W, H, minArea) {
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || seen[start]) continue;
    let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p - x) / W;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    if (n >= minArea) out.push({ n, minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return out;
}

// ── 1. Платформы фона ────────────────────────────────────────────────────────
{
  const { data, W, H, C } = await raw(path.join(SRC_DIR, 'Задний фон.png'));
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * C, r = data[i], g = data[i + 1], b = data[i + 2];
    if ((b > 140 && b - r > 55) || (r > 140 && r - b > 55)) mask[p] = 1;
  }
  const comps = components(mask, W, H, 300).sort((a, b) => b.n - a.n).slice(0, 14);
  const pct = (v, base) => +(v / base * 100).toFixed(2);
  console.log('── Платформы фона (в % от 1671×941) ──');
  comps.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  for (const c of comps) {
    console.log(`cx=${pct(c.cx, W)} cy=${pct(c.cy, H)} w=${pct(c.w, W)} h=${pct(c.h, H)} px=${c.n}`);
  }
}

// ── 2. Слоты и круги на спрайтах ─────────────────────────────────────────────
async function spriteGeometry(file, label) {
  const { data, W, H, C } = await raw(file);
  // контент по альфе
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let p = 0; p < W * H; p++) {
    if (data[p * C + 3] > 16) {
      const x = p % W, y = (p - x) / W;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const rel = (v, base, o) => +(((v - o) / base) * 100).toFixed(2);
  const relW = (v) => +((v / (maxX - minX + 1)) * 100).toFixed(2);
  const relH = (v) => +((v / (maxY - minY + 1)) * 100).toFixed(2);
  const dark = new Uint8Array(W * H), gold = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) < 62) dark[p] = 1;                       // тёмные окна слотов
    if (r > 165 && g > 115 && b < 105 && r - b > 70) gold[p] = 1;  // золотая отделка
  }
  const darkC = components(dark, W, H, 900).filter((c) => c.cx > minX && c.cx < maxX);
  const goldC = components(gold, W, H, 700).filter((c) => c.cx > minX && c.cx < maxX);
  console.log(`\n── ${label} (контент ${minX},${minY}..${maxX},${maxY}) ──`);
  console.log('слоты (тёмные окна):');
  darkC.sort((a, b) => a.cy - b.cy || a.cx - b.cx).slice(0, 8).forEach((c) =>
    console.log(`  x=${rel(c.minX, maxX - minX + 1, minX)}..${rel(c.maxX, maxX - minX + 1, minX)} y=${rel(c.minY, maxY - minY + 1, minY)}..${rel(c.maxY, maxY - minY + 1, minY)}  (${relW(c.w)}×${relH(c.h)}%)`));
  console.log('золотые кластеры (кандидаты кругов):');
  goldC.sort((a, b) => b.n - a.n).slice(0, 8).forEach((c) =>
    console.log(`  cx=${relW(c.cx - minX)} cy=${relH(c.cy - minY)} w=${relW(c.w)} h=${relH(c.h)} px=${c.n}`));
}

await spriteGeometry(path.join(SRC_DIR, 'Башня синяя.png'), 'Башня синяя (полная)');
await spriteGeometry(path.join(SRC_DIR, 'Красная башня.png'), 'Башня красная (полная)');
await spriteGeometry(path.join(SRC_DIR, 'Синий нексус.png'), 'Нексус синий');
