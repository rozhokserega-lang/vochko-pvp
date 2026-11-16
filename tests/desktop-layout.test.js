import {test} from 'node:test';
import assert from 'node:assert/strict';
import {desktopWorldMetrics,desktopObjectFrame,DESKTOP_WORLD,desktopLaneY} from '../src/ui/arena/desktop-layout.js';
import {towerBox,nexusBox} from '../src/ui/arena/arenaLayout.js';
test('desktop world: 12 tower sprites retain proportions and stay in their lanes at PC sizes',()=>{
 for(const [w,h] of [[1920,1080],[2560,1440],[1366,768],[3440,1440],[1280,1024]]){
  const metrics=desktopWorldMetrics(w,h);
  assert.ok(metrics.worldWidth>=w-.01&&metrics.worldHeight>=h-.01);
  for(const team of ['ally','enemy'])for(const kind of ['atk','def'])for(const lane of [0,1,2])for(const size of ['outer','inner']){
   const box=towerBox(team,kind,lane,size,'full'),frame=desktopObjectFrame(box,metrics,{lane});
   assert.ok(Math.abs(frame.width/frame.height-box.w/box.h)<1e-10);
   assert.ok(frame.left>=0&&frame.left+frame.width<=w);assert.ok(frame.top>h*.08);
   assert.ok(Math.abs(frame.bottom-(metrics.y+DESKTOP_WORLD.lanes[lane]*metrics.worldHeight))<.001);
   // The card row starts at 56% of the overlay artwork, below every tower base.
   const panelWidth=Math.min(w*.8,1240,h*1.22),panelHeight=panelWidth/3;
   assert.ok(frame.bottom<h-5-panelHeight+panelHeight*.56);
   assert.ok(desktopLaneY(lane,metrics)<frame.bottom);
  }
 }
});
test('desktop world: damaged and ruined foundations keep the same lane anchor',()=>{
 const metrics=desktopWorldMetrics(1920,1080);
 for(const team of ['ally','enemy'])for(const size of ['outer','inner']){
  const kind=team==='ally'?'def':'atk';
  const anchors=['full','damaged','ruins'].map(stage=>{const b=towerBox(team,kind,0,size,stage),f=desktopObjectFrame(b,metrics,{lane:0});return f.left+b.anchorX*f.width;});
  assert.ok(Math.max(...anchors)-Math.min(...anchors)<.001,anchors.join(','));
 }
});
test('desktop world: Nexus frames are undistorted, separated from tower columns and leave space for HP/Core',()=>{
 for(const [w,h] of [[1920,1080],[2560,1440],[1366,768],[3440,1440],[1280,1024]]){
  const metrics=desktopWorldMetrics(w,h);
  for(const side of ['ally','enemy']){
   const b=nexusBox(side),f=desktopObjectFrame(b,metrics,{nexus:true});
   assert.ok(Math.abs(f.width/f.height-b.w/b.h)<1e-10);assert.ok(f.top>70);assert.ok(f.left>=0&&f.left+f.width<=w);
   assert.ok(f.bottom+Math.max(58,h*.1)+h*.09<h);
  }
 }
});
