// Deterministic animated chroma-key cleanup; never flattens GIF animation.
import sharp from 'sharp';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir='src/ui/nexus-core/assets';await mkdir(dir,{recursive:true});
const sources=[['opening',process.argv[2]??`${dir}/opening-source.gif`],['waiting',process.argv[3]??`${dir}/waiting-source.gif`]];
const summary=[];
for(const [name,file]of sources){
  if(resolve(file)!==resolve(`${dir}/${name}-source.gif`))await copyFile(file,`${dir}/${name}-source.gif`);
  const meta=await sharp(file,{animated:true}).metadata(),{data,info}=await sharp(file,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=meta.pageHeight,frames=[],anchors=[];
  for(let frame=0;frame<meta.pages;frame++){
    const pixels=Buffer.from(data.subarray(frame*w*h*4,(frame+1)*w*h*4)),key=[...pixels.subarray(0,3)];
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let start=0,end=0;
    const push=p=>{if(seen[p])return;seen[p]=1;const off=p*4,d=Math.hypot(...key.map((c,i)=>pixels[off+i]-c));if(d<60)queue[end++]=p;};
    for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
    while(start<end){const p=queue[start++],off=p*4,d=Math.hypot(...key.map((c,i)=>pixels[off+i]-c));
      const alpha=Math.max(0,Math.min(1,(d-18)/42));pixels[off+3]=Math.round(255*alpha);
      if(alpha>0&&alpha<1)for(let c=0;c<3;c++)pixels[off+c]=Math.max(0,Math.min(255,Math.round((pixels[off+c]-key[c]*(1-alpha))/alpha)));
      const x=p%w,y=Math.floor(p/w);if(x)push(p-1);if(x<w-1)push(p+1);if(y)push(p-w);if(y<h-1)push(p+w);
    }
    let bottom=0;for(let p=0;p<w*h;p++)if(pixels[p*4+3]>180)bottom=Math.max(bottom,Math.floor(p/w));
    let left=w,right=0;for(let y=Math.max(0,bottom-22);y<=bottom;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>180){left=Math.min(left,x);right=Math.max(right,x);}
    anchors.push({bottom,cx:(left+right)/2,baseWidth:right-left});frames.push(pixels);
  }
  // Freeze the pedestal. Waiting footage keeps all metal/outer edges static;
  // only the central crystal and energy retain their animation.
  const reference=Buffer.from(frames[0]),anchor=anchors[0];
  for(const pixels of frames)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const crystal=((x-w/2)/(w*.21))**2+((y-h*.42)/(h*.43))**2<1;
    if(y>=anchor.bottom-20||(name==='waiting'&&!crystal)){
      const p=(y*w+x)*4;reference.copy(pixels,p,p,p+4);
    }
  }
  // Fixed scale and base anchor across both supplied sequences.
  let minX=w,minY=h,maxX=0,maxY=0;
  for(const pixels of frames)for(let p=0;p<w*h;p++)if(pixels[p*4+3]>10){const x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const crop={left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1};
  const scale=280/anchor.baseWidth,newW=Math.round(crop.width*scale),newH=Math.round(crop.height*scale);
  const left=Math.round(384-(anchor.cx-crop.left)*scale),top=Math.round(391-(anchor.bottom-crop.top)*scale);
  const normalized=[];for(const pixels of frames){
    const sprite=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).extract(crop).resize(newW,newH).png().toBuffer();
    normalized.push(await sharp({create:{width:768,height:400,channels:4,background:'#00000000'}}).composite([{input:sprite,left,top}]).raw().toBuffer());
  }
  const animation=name==='waiting'?[...normalized,...normalized.slice(1,-1).reverse()]:normalized;
  const delays=name==='waiting'?[...meta.delay,...meta.delay.slice(1,-1).reverse()]:meta.delay;
  await sharp(Buffer.concat(animation),{raw:{width:768,height:400*animation.length,channels:4,pageHeight:400}}).webp({lossless:true,loop:name==='opening'?1:0,delay:delays}).toFile(`${dir}/${name}.webp`);
  if(name==='opening'){
    await sharp(normalized[0],{raw:{width:768,height:400,channels:4}}).png().toFile(`${dir}/closed.png`);
  }
  if(name==='waiting')await sharp(normalized[0],{raw:{width:768,height:400,channels:4}}).png().toFile(`${dir}/open.png`);
  summary.push({name,frames:animation.length,delay:delays,crop,anchors,output:{width:768,height:400,baseX:384,baseY:391,baseWidth:280}});
}
await writeFile(`${dir}/metadata.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
