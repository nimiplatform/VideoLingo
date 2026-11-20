import type { NimiAIConfigSnapshot } from '@nimiplatform/sdk/ai';
import type { VideoLingoPlatform, AssetWrite } from '../src-component/platform.js';
type Media = { id:string;size:number;sha256:string;mediaType:string;name:string };
const READ = new Set(['projects.list','project.get','project.subtitles','batches.list','batch.get']);
const encode=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const decode=(text:string)=>Uint8Array.from(atob(text),value=>value.charCodeAt(0));
const wait=()=>new Promise(resolve=>setTimeout(resolve,100));

/** One document, one captured parent channel. A later account cannot rebind it. */
export function createRemoteWorkspacePlatform(port:MessagePort,kind:'web'|'android',initialDrafts:Record<string,unknown>={}):VideoLingoPlatform {
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();let sequence=0;let ended=false;
  const media=new Map<string,Media>();
  const drafts=new Map(Object.entries(initialDrafts));
  const inputs=new Map<string,{enabled:boolean;receive:(files:File[])=>void}>();
  let selected:{id:string;key:string;files:File[]}|undefined;
  const deliver=()=>{if(!selected||ended)return;const receiver=inputs.get(selected.key);if(!receiver)return;const selection=selected;selected=undefined;
    if(!receiver.enabled){port.postMessage({type:'file-accepted',id:selection.id,error:'The original input is unavailable. Review the project before importing.'});return;}
    port.postMessage({type:'file-accepted',id:selection.id});receiver.receive(selection.files);
  };
  const call=<T,>(operation:string,input:unknown={}):Promise<T>=>{
    if(ended)return Promise.reject(new Error('VideoLingo connection ended. Reconnect and read the existing project.'));
    const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});port.postMessage({id,operation,input});});
  };
  const renewal=setInterval(()=>{if(!ended&&media.size)void call('media.renew',{ids:[...media.keys()]}).catch(()=>{});},20000);
  port.onmessage=event=>{
    if(event.data?.type==='selected-files'){if(!ended){selected=event.data;deliver();}return;}
    if(event.data?.type==='cancel-file-delivery'){if(selected?.id===event.data.id)selected=undefined;return;}
    if(event.data?.ended){ended=true;clearInterval(renewal);for(const item of pending.values())item.reject(new Error('VideoLingo connection ended'));pending.clear();media.clear();port.close();return;}
    const item=pending.get(event.data?.id);if(!item)return;pending.delete(event.data.id);if(event.data.error)item.reject(new Error(event.data.error));else item.resolve(event.data.result);
  };port.start();
  async function stage(body:Blob|AsyncIterable<Uint8Array>,size:number,relativePath:string,mediaType:string,signal?:AbortSignal){
    signal?.throwIfAborted();const {id}=await call<{id:string}>('upload',{action:relativePath?'begin':'begin-json',size,...relativePath?{relativePath,mediaType}:{}});
    let finished=false,offset=0;
    async function* chunks(){if(body instanceof Blob){const reader=body.stream().getReader();try{while(true){const part=await reader.read();if(part.done)return;yield part.value;}}finally{await reader.cancel();reader.releaseLock();}}else yield* body;}
    try{
      for await(const part of chunks())for(let position=0;position<part.length;position+=65536){signal?.throwIfAborted();const bytes=part.subarray(position,position+65536);const result=await call<{received:number}>('upload',{action:'append',id,offset,data:encode(bytes)});offset+=bytes.length;if(result.received!==offset)throw new Error('The input upload was incomplete');}
      if(offset!==size)throw new Error('The input size changed during upload');signal?.throwIfAborted();await call('upload',{action:'finish',id});
      while(true){signal?.throwIfAborted();const result=await call<{state:string;error?:string}>('upload',{action:'read',id});if(result.state==='completed')break;if(result.state==='failed')throw new Error(result.error||'PC input import failed');await wait();}
      signal?.throwIfAborted();finished=true;return id;
    }finally{if(!finished)await call('upload',{action:'abort',id}).catch(()=>{});}
  }
  async function command<T>(name:string,payload:Record<string,unknown>={}):Promise<T>{
    if(name==='project.export'||name==='project.export-subtitles')return call<T>('client.export',{command:name,payload});
    const encoded=new TextEncoder().encode(JSON.stringify(payload));let input:{command:string;payload?:Record<string,unknown>;payloadId?:string}={command:name};
    if(encoded.length>128*1024)input.payloadId=await stage(new Blob([encoded]),encoded.length,'','application/json');else input.payload=payload;
    const {id}=await call<{id:string}>(READ.has(name)?'projects.read':'projects.write',input);let offset=0;const decoder=new TextDecoder();let json='';
    try{while(true){const result=await call<{state:string;error?:string;offset:number;nextOffset:number;size:number;data:string}>('result.read',{id,offset});if(result.state==='failed'||result.state==='unknown')throw new Error(result.error||'The original PC operation is unconfirmed; refresh existing projects before retrying');if(result.state==='pending'){await wait();continue;}const bytes=decode(result.data);if(result.offset!==offset||result.nextOffset!==offset+bytes.length||result.nextOffset>result.size)throw new Error('Invalid PC response range');json+=decoder.decode(bytes,{stream:true});offset=result.nextOffset;if(offset===result.size){json+=decoder.decode();return JSON.parse(json) as T;}if(!bytes.length)throw new Error('Incomplete PC response');}}
    finally{await call('result.release',{id}).catch(()=>{});}
  }
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type!=='videolingo-media'||!event.ports[0])return;
    const port=event.ports[0],record=media.get(event.data.id);let stopped=false,busy=false;
    if(!record){port.postMessage({error:'This document has no such media reference'});return;}
    let offset=0,end=record.size-1,status=200;
    const range=event.data.range as string|undefined;
    if(range){const matched=/^bytes=(\d*)-(\d*)$/.exec(range);if(!matched||(!matched[1]&&!matched[2])){port.postMessage({status:416,headers:{'content-range':`bytes */${record.size}`},done:true});return;}
      if(!matched[1])offset=Math.max(0,record.size-Number(matched[2]));else offset=Number(matched[1]);if(matched[1]&&matched[2])end=Math.min(end,Number(matched[2]));status=206;
      if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset>end||offset>=record.size){port.postMessage({status:416,headers:{'content-range':`bytes */${record.size}`},done:true});return;}}
    const length=Math.max(0,end-offset+1);port.postMessage({status,headers:{'content-type':record.mediaType,'content-length':String(length),'accept-ranges':'bytes',...(status===206?{'content-range':`bytes ${offset}-${end}/${record.size}`}:{})}});
    port.onmessage=async message=>{
      if(message.data?.cancel){stopped=true;return;}if(!message.data?.pull||busy||stopped)return;busy=true;
      try{if(offset>end){port.postMessage({done:true});stopped=true;return;}const result=await call<{offset:number;nextOffset:number;size:number;sha256:string;data:string}>('media.read',{id:record.id,offset,length:Math.min(131072,end-offset+1)});const bytes=decode(result.data);if(result.offset!==offset||result.nextOffset!==offset+bytes.length||!bytes.length||result.size!==record.size||result.sha256!==record.sha256)throw new Error('The media response was incomplete');offset=result.nextOffset;port.postMessage({bytes:bytes.buffer},[bytes.buffer]);}catch(error){port.postMessage({error:String(error)});stopped=true;}finally{busy=false;}
    };port.start();
  });
  return {kind,
    drafts:{read:key=>drafts.get(key),write:(key,value)=>{drafts.set(key,value);if(!ended)port.postMessage({type:'draft',key,value});}},
    files:kind==='android'?{choose:intent=>{if(ended)throw new Error('Reconnect before choosing a file');port.postMessage({type:'pick-files',intent,drafts:Object.fromEntries(drafts)});},subscribe:(key,enabled,receive)=>{const record={enabled,receive};inputs.set(key,record);if(!ended)port.postMessage({type:'file-input',key,enabled});deliver();return()=>{if(inputs.get(key)===record){inputs.delete(key);if(!ended)port.postMessage({type:'file-input',key,enabled:false});}};}}:undefined,
    checkAccess:async signal=>{signal.throwIfAborted();await call('inspect');signal.throwIfAborted();},command,
    aiConfig:{get:async()=>(await call<{configuration:NimiAIConfigSnapshot}>('inspect')).configuration,listOptions:async()=>{throw new Error('Configure AI in the PC VideoLingo App');},overwrite:async()=>{throw new Error('Configure AI in the PC VideoLingo App');}},
    storage:{assets:{write:async(input:AssetWrite)=>{const size=input.size??(input.body instanceof Blob?input.body.size:undefined);if(size===undefined)throw new Error('The input size is required');await stage(input.body,size,input.relativePath,input.mediaType,input.signal);},remove:relativePath=>call('upload.remove',{relativePath}),reveal:async()=>{throw new Error('Open the original file location in the PC App, or export it to this device');}}},
    listVoices:async kind=>(await call<{voices:{id:string;label:string}[]}>('voices.list',{kind})).voices,
    openMedia:async relativePath=>{const projectId=/^projects\/([0-9a-f-]+)\//.exec(relativePath)?.[1];if(!projectId)throw new Error('Choose media belonging to a project');const result=await call<Media>('media.open',{projectId,relativePath});media.set(result.id,result);return {url:new URL(`./__videolingo_media/${result.id}`,location.href).pathname,revoke:async()=>{media.delete(result.id);await call('media.close',{id:result.id}).catch(()=>{});}};},
  };
}
