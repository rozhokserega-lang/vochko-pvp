// Сверка: платформы фона vs башни референса. Синие кресты — платформы фона
// (по дугам свечения), красные — base-центры башен референса (по тёмному силуэту).
import sharp from 'sharp';
import path from 'node:path';
import os from 'node:os';

const dir = path.join(os.homedir(), 'Downloads', 'ресурсы');
const bgBuf = await sharp(path.join(dir, 'Задний фон.png')).raw().toBuffer({ resolveWithObject: true });
const refBuf = await sharp(path.join(dir, 'референс.png')).raw().toBuffer({ resolveWithObject: true });
const W = 1671, H = 941;

// платформы фона: дуги свечения в узких окнах вокруг ожидаемых колонок
const rowsDesign = [256, 475, 679];
const colsDesign = { blueOuter: 450, blueInner: 645, redInner: 959, redOuter: 1163 };
const ky = H / 900, kx = W / 1600;

function detect(buf, C, cx0, cy0, winX, winY, color) {
  const x0 = Math.round(cx0 * kx - winX), x1 = Math.round(cx0 * kx + winX);
  const y0 = Math.round(cy0 * ky - winY), y1 = Math.round(cy0 * ky + winY);
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * C, r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const hit = color === 'blue' ? (b > 140 && b - r > 55 && b - g > 15) : (r > 140 && r - b > 55 && r - g > 25);
      if (hit) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { cx: (minX + maxX) / 2 / kx, cy: (minY + maxY) / 2 / ky, w: (maxX - minX) / kx, h: (maxY - minY) / ky };
}

// тёмный силуэт башни в референсе
function darkRef(cx0, cy0, winX, winY) {
  const { data, info } = refBuf;
  const C = info.channels;
  const x0 = Math.round(cx0 * kx - winX), x1 = Math.round(cx0 * kx + winX);
  const y0 = Math.round(cy0 * ky - winY), y1 = Math.round(cy0 * ky + winY);
  let minX = 1e9, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) < 100 && Math.max(r, g, b) - Math.min(r, g, b) < 50) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { cx: (minX + maxX) / 2 / kx, bottom: maxY / ky, w: (maxX - minX) / kx };
}

const lines = [];
const report = [];
for (let r = 0; r < 3; r++) {
  for (const [name, cx] of Object.entries(colsDesign)) {
    const color = name.startsWith('blue') ? 'blue' : 'red';
    const plat = detect(bgBuf.data, bgBuf.info.channels, cx, rowsDesign[r], 70, 55, color);
    const ref = darkRef(cx, rowsDesign[r], 110, 120);
    report.push({ row: r, name, platCx: plat ? +plat.cx.toFixed(0) : null, platCy: plat ? +plat.cy.toFixed(0) : null, platW: plat ? +plat.w.toFixed(0) : null, refCx: ref ? +ref.cx.toFixed(0) : null, refBottom: ref ? +ref.bottom.toFixed(0) : null });
    if (plat) lines.push(`<line x1="${plat.cx * kx - 14}" y1="${plat.cy * ky}" x2="${plat.cx * kx + 14}" y2="${plat.cy * ky}" stroke="#00d0ff" stroke-width="4"/><line x1="${plat.cx * kx}" y1="${plat.cy * ky - 14}" x2="${plat.cx * kx}" y2="${plat.cy * ky + 14}" stroke="#00d0ff" stroke-width="4"/>`);
    if (ref) lines.push(`<line x1="${ref.cx * kx - 14}" y1="${(ref.bottom - 20) * ky}" x2="${ref.cx * kx + 14}" y2="${(ref.bottom - 20) * ky}" stroke="#ff2222" stroke-width="4"/>`);
  }
}
console.table(report);
const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`);
await sharp(path.join(dir, 'референс.png')).composite([{ input: svg }]).png().toFile('D:/Rotogochi/.local-tools/ref-vs-bg.png');
console.log('ok ref-vs-bg.png');
