import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ELEMENTS } from '../shared/elements.js';
import { elementAnimHTML } from '../src/ui/arena/ElementEffect.js';

const sources = [
  ['fire_vortex','elFireVortex'], ['lava','elLava'], ['ice','elIce'],
  ['thunderstorm','elThunderstorm'], ['sandstorm','elSandstorm'],
];
for (const [id,name] of sources) test(`${id}: real alpha in every frame, original timing and core pixels preserved`,async()=>{
  const path=ext=>fileURLToPath(new URL(`../src/ui/arena/assets/${name}${ext}`,import.meta.url));
  const original=path('.gif'), cleaned=path('-transparent.webp');
  const [before,after]=await Promise.all([sharp(original,{animated:true}).metadata(),sharp(cleaned,{animated:true}).metadata()]);
  assert.equal(after.pages,9); assert.equal(after.pages,before.pages);
  assert.equal(after.width,before.width); assert.equal(after.pageHeight,before.pageHeight);
  assert.deepEqual(after.delay,before.delay); assert.equal(after.loop,before.loop);
  const a=await sharp(original,{animated:true}).ensureAlpha().raw().toBuffer();
  const b=await sharp(cleaned,{animated:true}).ensureAlpha().raw().toBuffer();
  const w=after.width,h=after.pageHeight;
  for(let f=0;f<after.pages;f++) {
    let transparent=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const k=((f*h+y)*w+x)*4;
      if(!b[k+3])transparent++;
      if(Math.hypot(x-w/2,y-h/2)<w*.14) assert.deepEqual(b.subarray(k,k+4),a.subarray(k,k+4));
    }
    assert.ok(transparent>w*h*.25,`frame ${f}: backdrop remains`);
    for(const[x,y]of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]) assert.equal(b[((f*h+y)*w+x)*4+3],0);
  }
  assert.match(elementAnimHTML(ELEMENTS[id].icon),new RegExp(name+'-transparent\\.webp'));
});
