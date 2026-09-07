const RELEASE_MANIFEST='./v19-release-manifest.json';
const activeCacheName='troy-last-phalanx-v19-repair-1';
const isNetworkFirst=request=>/\.(html|js|css|json)$/.test(new URL(request.url).pathname)||request.mode==='navigate';
const cacheResponse=async(request,response)=>{if(response.status===200){const cache=await caches.open(activeCacheName);await cache.put(request,response.clone())}return response};
const offlineFallback=async request=>(await caches.match(request,{ignoreSearch:true}))||(request.mode==='navigate'?await caches.match('./index.html'):null)||Response.error();
const networkFirst=request=>fetch(request,{cache:'no-store'}).then(response=>cacheResponse(request,response)).catch(()=>offlineFallback(request));
const cacheFirst=request=>caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request).then(response=>cacheResponse(request,response)).catch(()=>offlineFallback(request)));
async function ranged(request){
 const cached=await caches.match(request.url,{ignoreSearch:true});if(!cached)return fetch(request);
 const blob=await cached.blob(),match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range'));
 let start=-1,end=blob.size-1;
 if(match&&(match[1]||match[2])){start=match[1]?Number(match[1]):Math.max(0,blob.size-Number(match[2]));if(match[1]&&match[2])end=Math.min(end,Number(match[2]));}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=blob.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+blob.size}});
 const headers=new Headers(cached.headers);headers.set('Content-Range',`bytes ${start}-${end}/${blob.size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
 return new Response(blob.slice(start,end+1),{status:206,headers});
}
self.addEventListener('install',event=>{event.waitUntil(fetch(RELEASE_MANIFEST,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`release manifest ${response.status}`);return response.json()}).then(manifest=>caches.open(activeCacheName).then(cache=>cache.addAll(manifest.urls.map(url=>new Request(url,{cache:'reload'}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('troy-last-phalanx-')&&key!==activeCacheName).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 if(new URL(event.request.url).origin!==location.origin)return;
 if(event.request.method==='HEAD'){event.respondWith(fetch(event.request,{cache:'no-store'}).catch(async()=>{const cached=await caches.match(event.request.url,{ignoreSearch:true});return cached?new Response(null,{status:200,headers:cached.headers}):Response.error()}));return}
 if(event.request.method!=='GET')return;
 event.respondWith(event.request.headers.has('range')?ranged(event.request):isNetworkFirst(event.request)?networkFirst(event.request):cacheFirst(event.request));
});
self.addEventListener('message',event=>{if(event.data==='TROY_CACHE_STATUS')event.source?.postMessage({type:'TROY_CACHE_STATUS',cacheName:activeCacheName,version:'19.0.1'})});
