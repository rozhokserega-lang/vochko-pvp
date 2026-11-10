// Точные центры платформ по золотой кайме (огибает весь эллипс).
import sharp from 'sharp';
import path from 'node:path';
import os from 'node:os';

const file = path.join(os.homedir(), 'Downloads', 'ресурсы', 'Задний фон.png');
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const kx = W / 1600, ky = H / 900;
const rows = [257, 473, 679];
const cols = { blueOuter: 450, blueInner: 645, redInner: 959, redOuter: 1163 };

const out = [];
for (let r = 0; r < 3; r++) {
  for (const [name, cx0] of Object.entries(cols)) {
    const x0 = Math.round(cx0 * kx - 85), x1 = Math.round(cx0 * kx + 85);
    const y0 = Math.round(rows[r] * ky - 55), y1 = Math.round(rows[r] * ky + 55);
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * C, R = data[i], G = data[i + 1], B = data[i + 2];
        if (R > 165 && G > 110 && B < 110 && R - B > 65) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    out.push({
      row: r, name,
      cx: +(((minX + maxX) / 2) / kx).toFixed(1),
      cy: +(((minY + maxY) / 2) / ky).toFixed(1),
      w: +(((maxX - minX) / kx)).toFixed(1),
      h: +(((maxY - minY) / ky)).toFixed(1),
    });
  }
}
console.table(out);
