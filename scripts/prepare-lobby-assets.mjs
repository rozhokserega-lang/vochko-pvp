import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
const source=process.argv[2];if(!source)throw Error('Usage: node scripts/prepare-lobby-assets.mjs <source-folder>');
const destination=resolve('src/ui/waiting-room/assets');await mkdir(destination,{recursive:true});
const images={background:['ЗАдний фон.png',1670],logo:['лого.png',900],panel:['Рамка.png',1672],player:['мой фон.png',1100],opponent:['Фон соперника.png',1100],vs:['VS.png',360],button:['Кнопка.png',1300]},manifest=[];
for(const [name,[file,width]]of Object.entries(images)){
  const bytes=await readFile(join(source,file)),before=await sharp(bytes).metadata();
  const result=await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:94,alphaQuality:100,effort:6}).toFile(join(destination,name+'.webp'));
  const after=await sharp(join(destination,name+'.webp')).metadata();
  manifest.push({asset:name+'.webp',source:file,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sourceSize:[before.width,before.height],size:[after.width,after.height],alpha:!!after.hasAlpha,bytes:result.size});
}
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${manifest.length} supplied assets; ${(manifest.reduce((sum,m)=>sum+m.bytes,0)/1048576).toFixed(2)} MiB total; alpha preserved.`);
