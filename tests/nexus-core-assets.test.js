import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
for(const name of ['opening','waiting'])test(`core ${name}: transparent animation, fixed base, correct loop`,async()=>{
  const file=new URL(`../src/ui/nexus-core/assets/${name}.webp`,import.meta.url),path=decodeURIComponent(file.pathname).replace(/^\/([A-Za-z]:)/,'$1');
  const meta=await sharp(path,{animated:true}).metadata();assert.equal(meta.width,768);assert.equal(meta.pageHeight,400);assert.equal(meta.pages,name==='opening'?9:16);assert.equal(meta.loop,name==='opening'?1:0);
  const {data,info}=await sharp(path,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bytes=768*400*4,first=data.subarray(380*768*4,bytes);
  for(let frame=0;frame<meta.pages;frame++){
    const start=frame*bytes;assert.equal(data[start+3],0);assert.equal(data[start+(767*4)+3],0);
    let transparent=0;for(let p=start+3;p<start+bytes;p+=4)if(!data[p])transparent++;
    assert.ok(transparent/(768*400)>.4);
    assert.deepEqual(data.subarray(start+380*768*4,start+bytes),first,'pedestal pixels never move');
  }
});
