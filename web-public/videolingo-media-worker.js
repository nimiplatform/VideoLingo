self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scopePath=new URL(self.registration.scope).pathname,prefix=scopePath+'__videolingo_media/';
  if(url.origin!==self.location.origin||!url.pathname.startsWith(prefix))return;
  const mediaId=url.pathname.slice(prefix.length);if(!/^[a-zA-Z0-9-]+$/.test(mediaId))return;
  event.respondWith((async()=>{
    const client=event.clientId?await self.clients.get(event.clientId):null;
    if(!client||new URL(client.url).pathname!==scopePath+'workspace.html')return new Response('Open media from the connected VideoLingo workspace',{status:403});
    const channel=new MessageChannel();let controller,resolveHeaders,rejectHeaders,ended=false;
    const headers=new Promise((resolve,reject)=>{resolveHeaders=resolve;rejectHeaders=reject;});
    const stream=new ReadableStream({start(value){controller=value;},pull(){channel.port1.postMessage({pull:true});},cancel(){ended=true;channel.port1.postMessage({cancel:true});}});
    channel.port1.onmessage=message=>{const data=message.data;if(ended)return;if(data.status)resolveHeaders(data);if(data.bytes)controller.enqueue(new Uint8Array(data.bytes));if(data.done){ended=true;controller.close();channel.port1.close();}if(data.error){ended=true;const error=new Error(data.error);rejectHeaders(error);controller.error(error);channel.port1.close();}};
    event.request.signal.addEventListener('abort',()=>channel.port1.postMessage({cancel:true}),{once:true});
    client.postMessage({type:'videolingo-media',id:mediaId,range:event.request.headers.get('range')||undefined},[channel.port2]);
    try{const response=await headers;return new Response(stream,{status:response.status,headers:response.headers});}catch(error){return new Response(String(error),{status:503});}
  })());
});
