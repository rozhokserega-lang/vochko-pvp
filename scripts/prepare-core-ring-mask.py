"""Extract the five dark track interiors without changing the supplied ring art."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageFilter
import sys
folder=Path(sys.argv[1]);image=Image.open(folder/'ring-base.png').convert('RGBA');w,h=image.size
mask=Image.new('L',image.size);pixels=mask.load()
for y in range(h):
 for x in range(w):
  r,g,b,a=image.getpixel((x,y));radius=((x/w-.5)**2+(y/h-.5)**2)**.5
  if a>200 and .30<radius<.47 and max(r,g,b)<145 and abs(r-b)<45 and abs(g-b)<45:pixels[x,y]=255
seen=set();groups=[]
for y in range(h):
 for x in range(w):
  if not pixels[x,y] or (x,y) in seen:continue
  queue=deque([(x,y)]);seen.add((x,y));group=[]
  while queue:
   xx,yy=queue.popleft();group.append((xx,yy))
   for nx,ny in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
    if 0<=nx<w and 0<=ny<h and pixels[nx,ny] and (nx,ny) not in seen:seen.add((nx,ny));queue.append((nx,ny))
  if len(group)>500:groups.append(group)
assert len(groups)==5,f'Expected five track interiors, found {len(groups)}'
clean=Image.new('L',image.size)
for group in groups:
 for xy in group:clean.putpixel(xy,255)
clean=clean.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.4))
# CSS masks use alpha, not the luminance of an opaque grayscale PNG.
result=Image.new('RGBA',image.size,(255,255,255,0));result.putalpha(clean);result.save(folder/'ring-track-mask.png',optimize=True)
