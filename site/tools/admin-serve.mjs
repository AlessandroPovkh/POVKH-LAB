import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,readdir,copyFile,lstat,rename} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {normalizeCatalog} from '../admin/catalog.mjs';
import {isOfficialStreamingUrl} from '../src/streaming.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sandbox=path.join(root,'output','admin-sandbox');
const port=Number(process.env.ADMIN_PORT||4178);const origin=`http://127.0.0.1:${port}`;
const catalogPath='site/data/catalog.json';const mediaRoot='site/assets/releases';
await mkdir(path.join(sandbox,'site/data'),{recursive:true});await mkdir(path.join(sandbox,mediaRoot),{recursive:true});
try {await copyFile(path.join(root,'data/catalog.json'),path.join(sandbox,catalogPath),1);}catch(e){if(e.code!=='EEXIST')throw e;}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const isMedia=p=>typeof p==='string'&&/^site\/assets\/releases\/[a-z0-9][a-z0-9._-]*\.(webp|jpe?g|png)$/i.test(p);
async function resolveFile(p,write=false){
 if(p!==catalogPath&&!isMedia(p))throw new Error('Этот файл недоступен редактору.');
 const target=path.join(sandbox,p);
 try {if((await lstat(target)).isSymbolicLink())throw new Error('Symbolic links are not allowed');return target;}catch(e){if(e.code!=='ENOENT')throw e;}
 return write?target:path.join(root,p.slice(5));
}
async function entry(file){const bytes=await readFile(await resolveFile(file.path));return {data:bytes.toString(),file:{...file,id:hash(bytes)}};}
async function media(p){const bytes=await readFile(await resolveFile(p));return {id:hash(bytes),content:bytes.toString('base64'),encoding:'base64',name:path.basename(p),path:p};}
async function assetWrite(asset){
 if(!isMedia(asset.path)||asset.encoding!=='base64')throw new Error('Загрузите JPG, PNG или WebP с латинским именем.');
 const bytes=Buffer.from(asset.content,'base64');if(bytes.length>15*1024*1024)throw new Error('Обложка больше 15 МБ.');
 const sharp=(await import('sharp')).default;const metadata=await sharp(bytes,{limitInputPixels:40000000}).metadata();
 if(!['jpeg','png','webp'].includes(metadata.format))throw new Error('Недопустимый формат изображения.');
 await writeFile(await resolveFile(asset.path,true),bytes);return media(asset.path);
}
async function api(body){
 const p=body.params||{};
 switch(body.action){
 case 'info':return {repo:'POVKH LAB local sandbox',publish_modes:['simple'],type:'local_fs'};
 case 'entriesByFiles':return Promise.all(p.files.map(entry));
 case 'getEntry':return entry({path:p.path});
 case 'getMedia':{if(p.mediaFolder!==mediaRoot)throw new Error('Недоступная папка.');const names=new Set([...(await readdir(path.join(root,'assets/releases'))),...(await readdir(path.join(sandbox,mediaRoot)))]);return Promise.all([...names].map(n=>`${mediaRoot}/${n}`).filter(isMedia).map(media));}
 case 'getMediaFile':return media(p.path);
 case 'persistMedia':return assetWrite(p.asset);
 case 'persistEntry':{
  if(p.dataFiles?.length!==1||p.dataFiles[0].path!==catalogPath)throw new Error('Можно сохранить только каталог.');
  const data=normalizeCatalog(JSON.parse(p.dataFiles[0].raw),isOfficialStreamingUrl);
  const previous=JSON.parse(await readFile(path.join(sandbox,catalogPath),'utf8'));
  if(data.releases.length<previous.releases.length)throw new Error('Удаление релизов отключено.');
  for(const asset of p.assets||[])await assetWrite(asset);
  for(const release of data.releases)await readFile(await resolveFile(`site/${release.artwork}`));
  const target=path.join(sandbox,catalogPath);const tmp=`${target}.${randomBytes(8).toString('hex')}.tmp`;await writeFile(tmp,JSON.stringify(data,null,2)+'\n');await rename(tmp,target);
  return {message:'Сохранено в локальную копию'};
 }
 case 'getDeployPreview':return null;
 default:throw new Error('Действие не поддерживается локальным редактором.');
 }
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':mime['.json']});res.end(JSON.stringify(data));};
 try{
  if(req.headers.host!==`127.0.0.1:${port}`)return json(403,{error:'Invalid host'});
  const url=new URL(req.url,origin);
  if(req.method==='POST'&&url.pathname==='/api/cms'){
   if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return json(403,{error:'Invalid origin'});
   let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>22*1024*1024)throw new Error('Запрос слишком большой.');parts.push(chunk);}
   return json(200,await api(JSON.parse(Buffer.concat(parts))));
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed'});
  if(url.pathname==='/'){res.writeHead(302,{Location:'/admin/'});return res.end();}
  if(url.pathname==='/admin/settings.json')return json(200,{local:true,releases:JSON.parse(await readFile(path.join(sandbox,catalogPath))).releases.map(({id,title})=>({id,title})),artists:JSON.parse(await readFile(path.join(root,'data/artists.json'))).artists.map(({name})=>({name}))});
  const pathname=decodeURIComponent(url.pathname);if(pathname.includes('..')||pathname.includes('\\')||pathname.includes('\0'))return json(400,{error:'Invalid path'});
  let file;
  if(pathname==='/admin/streaming.mjs')file=path.join(root,'src/streaming.mjs');
  else if(pathname.startsWith('/admin/'))file=path.join(root,pathname==='/admin/'?'admin/index.html':pathname.slice(1));
  else if(pathname.startsWith('/assets/releases/'))file=await resolveFile(`site${pathname}`);
  else return json(404,{error:'Не найдено. Откройте /admin/.'});
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){json(error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Файл не найден.':error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local Decap editor: ${origin}/admin/\nSandbox: ${sandbox}`));
