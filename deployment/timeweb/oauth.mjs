import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Run behind HTTPS; secrets stay in the server environment, outside the web root.
export function createOAuthHandler({origin,clientId,clientSecret,fetchImpl=fetch,now=Date.now}) {
 const site=new URL(origin);
 if(site.protocol!=='https:'||site.origin!==origin||!clientId||!clientSecret)throw new Error('HTTPS origin and OAuth credentials are required');
 const sessions=new Map();
 const callback=`${origin}/admin/auth/callback`;
 const cookie=(value,age)=>`__Host-povkh-oauth=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
 const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  const fail=(code,message)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);};
  try {
   if(req.method!=='GET')return fail(405,'Method not allowed');
   const url=new URL(req.url,origin);
   if(url.pathname==='/admin/auth') {
    for(const [key,value]of sessions)if(value.expires<now())sessions.delete(key);
    if(sessions.size>=1000)return fail(503,'Try again later');
    const session=randomBytes(32).toString('hex');const state=randomBytes(32).toString('hex');const verifier=randomBytes(48).toString('base64url');
    sessions.set(session,{state,verifier,expires:now()+600000});
    const target=new URL('https://github.com/login/oauth/authorize');
    target.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,scope:'public_repo',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    res.writeHead(302,{'Set-Cookie':cookie(session,600),Location:target.href});return res.end();
   }
   if(url.pathname!=='/admin/auth/callback')return fail(404,'Not found');
   const session=req.headers.cookie?.split(';').map(p=>p.trim()).find(p=>p.startsWith('__Host-povkh-oauth='))?.split('=')[1];
   const saved=sessions.get(session);sessions.delete(session);res.setHeader('Set-Cookie',cookie('',0));
   if(!saved||saved.expires<now()||!equal(url.searchParams.get('state'),saved.state)||!url.searchParams.get('code'))return fail(403,'Sign-in expired or invalid. Close this window and sign in again.');
   const result=await fetchImpl('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:saved.verifier}),signal:AbortSignal.timeout(15000)});
   if(!result.ok)return fail(502,'GitHub sign-in failed. Try again.');
   const data=await result.json();if(typeof data.access_token!=='string'||!data.access_token)return fail(502,'GitHub sign-in failed. Try again.');
   const nonce=randomBytes(24).toString('base64');
   const safe=value=>JSON.stringify(value).replaceAll('<','\\u003c');
   const message=`authorization:github:success:${JSON.stringify({token:data.access_token,provider:'github'})}`;
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`});
   res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход в POVKH LAB</title><p>Завершение входа…</p><script nonce="${nonce}">const origin=${safe(origin)};if(window.opener){const receive=e=>{if(e.origin!==origin||e.source!==window.opener||e.data!=='authorizing:github')return;window.removeEventListener('message',receive);window.opener.postMessage(${safe(message)},origin);window.close();};window.addEventListener('message',receive);window.opener.postMessage('authorizing:github',origin);}else{document.querySelector('p').textContent='Откройте вход из админки сайта.';}</script></html>`);
  } catch {if(!res.headersSent)fail(502,'Sign-in unavailable. Try again.');else res.end();}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const handler=createOAuthHandler({origin:process.env.POVKH_SITE_ORIGIN,clientId:process.env.GITHUB_CLIENT_ID,clientSecret:process.env.GITHUB_CLIENT_SECRET});
 http.createServer(handler).listen(Number(process.env.OAUTH_PORT||4180),'127.0.0.1',()=>console.log('OAuth listening on loopback'));
}
