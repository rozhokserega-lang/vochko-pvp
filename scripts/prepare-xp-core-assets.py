from pathlib import Path
from PIL import Image
import sys,json,hashlib,unicodedata
src=Path(sys.argv[1]);dst=Path(sys.argv[2]);dst.mkdir(parents=True,exist_ok=True)
paths={unicodedata.normalize('NFC',p.name):p for p in src.glob('*.png')}
manifest={}
def save(name,source,box=None,width=None):
 p=paths[unicodedata.normalize('NFC',source)];im=Image.open(p).convert('RGBA')
 if box: im=im.crop(box)
 if name.startswith('icon-'):
  # Only connected light background is removed; highlights inside the icon stay opaque.
  from collections import deque
  px=im.load();w,h=im.size;seen=set();q=deque([(x,0) for x in range(w)]+[(x,h-1) for x in range(w)]+[(0,y) for y in range(h)]+[(w-1,y) for y in range(h)])
  while q:
   x,y=q.popleft()
   if (x,y) in seen or x<0 or y<0 or x>=w or y>=h:continue
   seen.add((x,y));r,g,b,a=px[x,y]
   if min(r,g,b)<210 or max(r,g,b)-min(r,g,b)>20:continue
   px[x,y]=(r,g,b,0);q.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])
 bbox=im.getbbox()
 if bbox:im=im.crop(bbox)
 if width and im.width>width:im=im.resize((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
 im.save(dst/(name+'.png'),optimize=True)
 manifest[name]={'source':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'crop':box,'size':im.size}
save('panel-bg','Золотая рамка с синим кристаллом.png',width=500)
save('ring-base','Золотое кольцо интерфейса с пятью секциями.png',width=600)
save('crystal-blue','Сияющий синий кристалл.png',width=400)
save('header-plate','Золотая синяя табличка с сиянием-1.png',width=650)
save('level-plate','Золотая рамка с синим сиянием-2.png',width=600)
save('bottom-deco','Золотой крылатый герб с синим кристаллом.png',width=650)
save('row-active','Золотая и серебряная панели интерфейса.png',(0,0,2172,365),700)
save('row-locked','Золотая и серебряная панели интерфейса.png',(0,365,2172,724),700)
for name,box in [('hp',(0,80,465,620)),('attack',(465,80,900,620)),('shield',(900,80,1330,620)),('check',(1330,80,1760,620)),('lock',(1760,80,2172,620))]:
 save('icon-'+name,'Глянцевые игровые иконки_ сердце, мечи, щит и замок.png',box,180)
(dst/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
