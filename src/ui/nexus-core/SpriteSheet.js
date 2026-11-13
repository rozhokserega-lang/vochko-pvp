// Optional PNG sprite-sheet adapter. Current supplied art uses animated WebP;
// a future sheet can use this renderer without touching combat/server state.
export function spriteFrameRect({width,height,columns,rows,frames},index){
  if(![width,height,columns,rows,frames].every(n=>Number.isInteger(n)&&n>0)||frames>columns*rows||width%columns||height%rows)throw Error('Invalid sprite-sheet metadata');
  const frame=((index%frames)+frames)%frames,w=width/columns,h=height/rows;
  return {x:(frame%columns)*w,y:Math.floor(frame/columns)*h,width:w,height:h};
}
export async function mountCoreSprite(host,{url,columns,rows,frames,frameMs=110,loop=false,reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches}){
  if(!(frameMs>0))throw Error('Invalid sprite timing');
  const image=new Image();image.src=url;await image.decode();
  const metadata={width:image.naturalWidth,height:image.naturalHeight,columns,rows,frames},first=spriteFrameRect(metadata,0);
  const canvas=document.createElement('canvas');canvas.width=first.width;canvas.height=first.height;
  canvas.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none';canvas.setAttribute('aria-hidden','true');host.replaceChildren(canvas);
  const context=canvas.getContext('2d');
  const draw=index=>{const r=spriteFrameRect(metadata,index);context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,r.x,r.y,r.width,r.height,0,0,r.width,r.height);};
  draw(0);let stopped=false,raf=0;const start=performance.now();
  const tick=time=>{if(stopped||!host.isConnected)return;const elapsed=Math.floor((time-start)/frameMs);draw(loop?elapsed:Math.min(frames-1,elapsed));if(loop||elapsed<frames-1)raf=requestAnimationFrame(tick);};
  if(!reducedMotion)raf=requestAnimationFrame(tick);
  return {canvas,stop(){stopped=true;cancelAnimationFrame(raf);}};
}
