// Deterministic, frame-by-frame cleanup of the supplied GIFs. Originals stay intact.
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const names = ['elFireVortex', 'elLava', 'elIce', 'elThunderstorm', 'elSandstorm'];
const root = new URL('../src/ui/arena/assets/', import.meta.url);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function clearFrame(pixels, width, height) {
  const count = width * height, background = new Uint8Array(count);
  const queue = new Int32Array(count);
  const coreRadius = Math.min(width, height) * .27;
  const candidate = i => {
    const x = i % width, y = Math.floor(i / width);
    if (Math.hypot(x - width / 2, y - height / 2) < coreRadius) return false;
    const k = i * 4, r = pixels[k], g = pixels[k + 1], b = pixels[k + 2];
    return Math.min(r,g,b) >= 190 && Math.max(r,g,b) - Math.min(r,g,b) <= 22;
  };
  let head = 0, tail = 0;
  const seed = i => { if (!background[i] && candidate(i)) { background[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x+dx < 0 || x+dx >= width || y+dy < 0 || y+dy >= height) continue;
      seed(i + dy * width + dx);
    }
  }
  // Distance to the removed backdrop. Only a narrow edge band is unmatted.
  const distance = new Uint8Array(count).fill(255);
  head = 0; tail = 0;
  for (let i = 0; i < count; i++) if (background[i]) { distance[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    if (distance[i] >= 6) continue;
    const x = i % width, y = Math.floor(i / width);
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (x+dx < 0 || x+dx >= width || y+dy < 0 || y+dy >= height) continue;
      const j = i + dy*width + dx;
      if (distance[j] === 255) { distance[j] = distance[i] + 1; queue[tail++] = j; }
    }
  }
  const original = Buffer.from(pixels);
  for (let i = 0; i < count; i++) {
    const k = i * 4;
    if (background[i]) { pixels.fill(0, k, k+4); continue; }
    if (distance[i] > 3) continue;
    const x = i % width, y = Math.floor(i / width);
    let nearest = -1, best = Infinity;
    for (let dy=-7; dy<=7; dy++) for (let dx=-7; dx<=7; dx++) {
      if (x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
      const j=i+dy*width+dx, d=dx*dx+dy*dy;
      if (distance[j]>=5 && distance[j]!==255 && d<best) { nearest=j*4; best=d; }
    }
    if (nearest<0) continue;
    let numerator=0, denominator=0;
    for(let c=0;c<3;c++) {
      numerator+=(original[k+c]-248)*(original[nearest+c]-248);
      denominator+=(original[nearest+c]-248)**2;
    }
    if (denominator<500) continue;
    const alpha=clamp(numerator/denominator,.05,1);
    const error=Math.sqrt([0,1,2].reduce((sum,c)=>sum+(original[k+c]-(248+alpha*(original[nearest+c]-248)))**2,0)/3);
    if(alpha>=.98 || error>22) continue;
    pixels[k+3]=Math.round(alpha*255);
    for(let c=0;c<3;c++) pixels[k+c]=Math.round(clamp((original[k+c]-(1-alpha)*248)/alpha,0,255));
  }
  return background.reduce((sum,v)=>sum+v,0)/count;
}

for (const name of names) {
  const input = new URL(name + '.gif',root), output = new URL(name + '-transparent.webp',root);
  const source = fileURLToPath(input), target = fileURLToPath(output);
  const metadata = await sharp(source,{animated:true}).metadata();
  const {data,info} = await sharp(source,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const frameHeight=metadata.pageHeight??metadata.height, frames=metadata.pages??1;
  const removed=[];
  for(let f=0;f<frames;f++) {
    const frame=data.subarray(f*info.width*frameHeight*4,(f+1)*info.width*frameHeight*4);
    removed.push(clearFrame(frame,info.width,frameHeight));
  }
  await sharp(data,{raw:{width:info.width,height:frameHeight*frames,channels:4,pageHeight:frameHeight}})
    .webp({lossless:true,alphaQuality:100,effort:5,loop:metadata.loop??0,delay:metadata.delay}).toFile(target);
  const checked=await sharp(target,{animated:true}).metadata();
  assert.equal(checked.pages,frames); assert.equal(checked.width,info.width);
  assert.equal(checked.pageHeight,frameHeight); assert.equal(checked.loop,metadata.loop);
  assert.deepEqual(checked.delay,metadata.delay);
  console.log(name,JSON.stringify({frames,delay:checked.delay,transparentPct:removed.map(v=>+(v*100).toFixed(1))}));
}
