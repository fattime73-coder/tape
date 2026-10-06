const CACHE='cosmic-tape-v1';const ASSETS=['./style.css','./app.js','./audio.js','./capture-worklet.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./fonts/space-400.woff2','./fonts/space-700.woff2','./fonts/mono-400.woff2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.mode==='navigate'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});
