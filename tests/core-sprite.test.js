import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spriteFrameRect} from '../src/ui/nexus-core/SpriteSheet.js';
test('PNG sprite adapter addresses rows/columns and wraps exact frames',()=>{
  const meta={width:400,height:180,columns:4,rows:3,frames:10};
  assert.deepEqual(spriteFrameRect(meta,5),{x:100,y:60,width:100,height:60});
  assert.deepEqual(spriteFrameRect(meta,10),spriteFrameRect(meta,0));
  assert.throws(()=>spriteFrameRect({...meta,frames:13},0));
  assert.throws(()=>spriteFrameRect({...meta,width:401},0));
});
