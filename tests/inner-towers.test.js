import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {towerHTML} from '../src/ui/arena/TowerView.js';
import {towerBox,LAYOUT} from '../src/ui/arena/arenaLayout.js';
import {INNER_TOWER_ASSETS} from '../src/ui/arena/inner-tower-assets.js';
import {ARENA_ASSETS} from '../src/ui/arena/arena-assets.js';
const slots=[0,1,2].map(()=>({atk:[],def:[]}));
for(const [team,kind,old]of [['ally','def','towerAlly'],['enemy','atk','towerEnemy']])test(`${team}: new models apply only to 18 HP towers and preserve the foundation across states`,async()=>{
  for(const [stage,hp,outerHp,oldSuffix]of [['full',18,12,'Full'],['damaged',9,6,'Damaged'],['ruins',0,0,'Ruins']]){
    const inner=towerHTML({hp,max:18,lane:0,kind,active:hp>0,slots,label:'Inner'});
    const outer=towerHTML({hp:outerHp,max:12,lane:0,kind,active:outerHp>0,slots,label:'Outer'});
    assert.ok(inner.includes(INNER_TOWER_ASSETS[team][stage]));assert.ok(outer.includes(ARENA_ASSETS[old+oldSuffix]));
    const meta=await sharp(fileURLToPath(INNER_TOWER_ASSETS[team][stage])).metadata();assert.ok(meta.hasAlpha&&meta.width>0&&meta.height>0);
    const box=towerBox(team,kind,0,'inner',stage),obj=LAYOUT.towers.find(t=>t.id===`tower-${team}-${kind}-0-inner`);
    assert.ok(Math.abs(box.cx-box.w/2+box.w*box.anchorX-obj.cx)<.01);assert.equal(box.bottom,obj.bottom);
  }
});
