// Local development launcher. The server owns a separate process group so closing
// the invoking terminal does not terminate an active local game.
import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT??5193);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid preview port');
const url=`http://127.0.0.1:${port}/`;
async function isRunning(){try{const r=await fetch(url,{signal:AbortSignal.timeout(800)});return r.ok&&(await r.text()).includes('ВОЧКО');}catch{return false;}}
if(await isRunning())console.log('Игра уже запущена: '+url);
else{
  const runtime=join(root,'.local-preview');mkdirSync(runtime,{recursive:true});
  const log=openSync(join(runtime,'server.log'),'a');
  const child=spawn(process.execPath,['scripts/dev-local.mjs','--port',String(port)],{cwd:root,detached:true,stdio:['ignore',log,log]});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.unref();closeSync(log);
  if(child.pid)writeFileSync(join(runtime,'server.pid'),String(child.pid));
  let ready=false;for(let i=0;i<20;i++){if(await isRunning()){ready=true;break;}await delay(150);}
  if(!ready)throw Error('Не удалось запустить локальную игру. Подробности: .local-preview/server.log');
  console.log('Игра запущена отдельным процессом: '+url);
}
