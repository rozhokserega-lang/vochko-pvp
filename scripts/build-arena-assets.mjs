// Конвейер ассетов новой арены (v20). Читает исходники из папки ресурсов,
// чинит шахматку-прозрачность, конвертирует в webp и генерирует
// src/ui/arena/arena-assets.js с инлайновыми data-URI (паттерн v19:
// нулевые пути = гарантированная работа на GitHub Pages и в standalone).
//
//   node scripts/build-arena-assets.mjs [папка-с-ресурсами]
//
// По умолчанию: %USERPROFILE%/Downloads/ресурсы
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import os from 'node:os';

const SRC_DIR = process.argv[2] || path.join(os.homedir(), 'Downloads', 'ресурсы');
const OUT_DIR = 'src/ui/arena/assets';
const GEN_FILE = 'src/ui/arena/arena-assets.js';

const FILES = {
  bg: 'Задний фон.png',
  reference: 'референс.png',
  towerAllyFull: 'Башня синяя.png',
  towerAllyDamaged: 'синяя башня пол хп.png',
  towerAllyRuins: 'Синяя башня разрушена.png',
  towerEnemyFull: 'Красная башня.png',
  towerEnemyDamaged: 'Красная башня пол хп.png',
  towerEnemyRuins: 'Красная башня разрушена.png',
  nexusAlly: 'Синий нексус.png',
  nexusEnemy: 'Нексус красный.png',
  elFire: 'анимация_огненного_шара_в_девяти_кадрах (1).png',
  elWater: 'анимация_водяных_энергетических_сфер.png',
  elEarth: 'вращающиеся_каменные_сферы_с_магмой.png',
  elAir: 'вихревой_облачный_шар.png',
  elSteam: 'анимированная_сфера_клубящегося_пара.png',
  elStorm: 'анимированный_каменно_ветряной_вихрь.png',
};

const SIZES = {
  bg: { width: 1280 },
  reference: null, // в бандл не идёт — только для сверки
  towerAllyFull: { height: 700 },
  towerAllyDamaged: { height: 700 },
  towerAllyRuins: { height: 560 },
  towerEnemyFull: { height: 700 },
  towerEnemyDamaged: { height: 700 },
  towerEnemyRuins: { height: 560 },
  nexusAlly: { height: 960 },
  nexusEnemy: { height: 960 },
  elFire: { width: 240 }, elWater: { width: 240 }, elEarth: { width: 240 },
  elAir: { width: 240 }, elSteam: { width: 240 }, elStorm: { width: 240 },
};

const QUALITY = { default: 78, animated: 64 };
const ANIM_DELAY = 90;

/** Кадр спрайта по контент-bbox (alpha > 16): бокс = контент, проценты слотов прямые. */
async function cropToContent(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let p = 0; p < W * H; p++) {
    if (data[p * C + 3] > 16) {
      const x = p % W, y = (p - x) / W;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
  maxX = Math.min(W - 1, maxX + 2); maxY = Math.min(H - 1, maxY + 2);
  return sharp(input).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

const exists = (f) => fs.existsSync(path.join(SRC_DIR, f));
for (const [key, file] of Object.entries(FILES)) {
  if (key !== 'reference' && !exists(file)) {
    console.error(`✗ не найден ресурс: ${file} (в ${SRC_DIR})`);
    process.exit(1);
  }
}

/** Рисованную шахматку (псевдо-прозрачность) заменяем настоящей альфой:
 *  заливка из краёв по двум серым цветам шахматки. */
async function removeCheckerboard(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => (y * W + x) * C;
  // Эталонные цвета шахматки собираем со ВСЕГО периметра: там встречаются оба
  // цвета клетки (башня рамки не касается).
  const palette = [];
  const addColor = (i) => {
    const r = data[i] & ~7, g = data[i + 1] & ~7, b = data[i + 2] & ~7;
    if (!palette.some((c) => Math.abs(c[0] - r) < 12 && Math.abs(c[1] - g) < 12 && Math.abs(c[2] - b) < 12)) palette.push([r, g, b]);
  };
  for (let x = 0; x < W; x += 3) { addColor(at(x, 1)); addColor(at(x, H - 2)); }
  for (let y = 0; y < H; y += 3) { addColor(at(1, y)); addColor(at(W - 2, y)); }
  const isChecker = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return palette.some((c) => Math.abs(c[0] - r) < 14 && Math.abs(c[1] - g) < 14 && Math.abs(c[2] - b) < 14);
  };
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, x + (H - 1) * W); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const x = p % W, y = (p - x) / W;
    const i = p * C;
    if (!isChecker(i)) continue;
    seen[p] = 1;
    data[i + 3] = 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = {};
let total = 0;

for (const [key, file] of Object.entries(FILES)) {
  if (key === 'reference') continue; // референс не бандлим
  let input = path.join(SRC_DIR, file);
  let tmpFixed = null;
  if (key === 'towerAllyDamaged') {
    const fixed = await removeCheckerboard(input);
    tmpFixed = path.join(OUT_DIR, '_tmp-fixed.png');
    fs.writeFileSync(tmpFixed, fixed);
    input = tmpFixed;
  }
  const meta = await sharp(input).metadata();
  const animated = meta.format === 'gif' && meta.pages > 1;
  if (!animated && key !== 'bg') input = await cropToContent(input); // спрайты — по контенту
  let pipe = sharp(input, animated ? { animated: true } : undefined);
  const size = SIZES[key];
  if (size?.width) pipe = pipe.resize({ width: size.width });
  if (size?.height) pipe = pipe.resize({ height: size.height });
  let result;
  if (animated) {
    result = await pipe.webp({ quality: QUALITY.animated, effort: 5, loop: 0, delay: Array(meta.pages).fill(ANIM_DELAY) }).toBuffer();
  } else {
    result = await pipe.webp({ quality: QUALITY.default, effort: 5, alphaQuality: 90 }).toBuffer();
  }
  if (tmpFixed) fs.rmSync(tmpFixed, { force: true });
  const name = key + '.webp';
  fs.writeFileSync(path.join(OUT_DIR, name), result);
  const outMeta = await sharp(result, { animated: true }).metadata();
  out[key] = { file: name, w: outMeta.width, h: outMeta.height, pages: outMeta.pages ?? 1, bytes: result.length };
  total += result.length;
  console.log(`✓ ${name} ${outMeta.width}x${outMeta.height}${outMeta.pages > 1 ? ` (${outMeta.pages} кадров)` : ''} — ${(result.length / 1024).toFixed(0)} КБ`);
}
console.log(`Итого: ${(total / 1024).toFixed(0)} КБ (base64 ≈ ${(total * 1.37 / 1024).toFixed(0)} КБ)`);

// Генерация модуля с инлайновыми data-URI + карта пропорций контента.
const entries = Object.entries(out).map(([key, v]) => {
  const b64 = fs.readFileSync(path.join(OUT_DIR, v.file)).toString('base64');
  return `  ${key}: 'data:image/webp;base64,${b64}',`;
});
const aspects = Object.entries(out).filter(([, v]) => v.pages === 1)
  .map(([key, v]) => `  ${key}: { w: ${v.w}, h: ${v.h} },`);
const banner = `// Артефакты арены v20 — СГЕНЕРИРОВАНО scripts/build-arena-assets.mjs (не править руками).
// Инлайновые webp — как в v19: нулевые пути = гарантированная загрузка на GitHub Pages и в standalone.
export const ARENA_ASSETS = {
${entries.join('\n')}
};

// Размеры контент-bbox (после кадрирования) — для aspect-ratio боксов в верстке.
export const ARENA_DIMS = {
${aspects.join('\n')}
};
`;
fs.writeFileSync(GEN_FILE, banner, 'utf8');
console.log(`✓ ${GEN_FILE}`);
