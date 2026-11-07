const offlineHTML='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JUNAF · 离线</title><body><main><h1>JUNAF 后台暂时离线</h1><p>连接网络后即可继续使用。</p><a href="/admin/">重新打开后台</a></main></body></html>';
const publicPaths=new Set(['/admin/','/admin/install/']);
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||request.mode!=='navigate')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!publicPaths.has(url.pathname))return;
 event.respondWith(fetch(request).catch(()=>new Response(offlineHTML,{
  status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
 })));
});
