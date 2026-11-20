import type {NimiAppScope} from '@nimiplatform/kit/core/app-session';
const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
const decode=(value:string)=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
const READ=new Set(['projects.list','project.get','project.subtitles','batches.list','batch.get']);
const MAX_BLOB_EXPORT_BYTES=32*1024*1024;
const BLOB_EXPORT_EXT=/\.(srt|zip|txt|json|csv|xlsx)$/i;
type Media={id:string;size:number;sha256:string;mediaType:string;name:string};
function within<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new Error('VideoLingo connection ended'));if(signal.aborted){void promise.catch(()=>{});abort();return;}signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
export function remoteVideoLingoSession(scope:NimiAppScope,targetRef:string){
  async function call<T>(operation:string,input:unknown={}):Promise<T>{
    const signal=AbortSignal.any([scope.signal,AbortSignal.timeout(70_000)]);signal.throwIfAborted();
    let result=await within(scope.client.integration.invoke({targetRef,operation,inputJson:JSON.stringify(input)}),signal);
    while(result.status==='accepted'){await within(pause(),signal);result=await within(scope.client.integration.getCall({callId:result.callId}),signal);}
    if(result.status!=='completed')throw new Error(result.errorCode||result.status);return JSON.parse(result.resultJson) as T;
  }
  async function command<T>(name:string,payload:unknown):Promise<T>{const {id}=await call<{id:string}>(READ.has(name)?'projects.read':'projects.write',{command:name,payload});let offset=0;const decoder=new TextDecoder();let json='';try{while(true){const part=await call<{state:string;error?:string;data:string;offset:number;nextOffset:number;size:number}>('result.read',{id,offset});if(part.state==='pending'){await within(pause(),scope.signal);continue;}if(part.state!=='completed')throw new Error(part.error||'Read the original PC operation before deciding to retry');const bytes=decode(part.data);if(part.offset!==offset||part.nextOffset!==offset+bytes.length||part.nextOffset>part.size)throw new Error('Invalid result range');offset=part.nextOffset;json+=decoder.decode(bytes,{stream:true});if(offset===part.size){json+=decoder.decode();return JSON.parse(json) as T;}if(!bytes.length)throw new Error('Incomplete PC response');}}finally{await call('result.release',{id}).catch(()=>{});}}
  async function* mediaBytes(media:Media){let offset=0;while(offset<media.size){scope.signal.throwIfAborted();const part=await call<{offset:number;nextOffset:number;size:number;sha256:string;data:string}>('media.read',{id:media.id,offset,length:Math.min(131072,media.size-offset)});const bytes=decode(part.data);if(part.offset!==offset||part.nextOffset!==offset+bytes.length||!bytes.length||part.size!==media.size||part.sha256!==media.sha256)throw new Error('The original media is incomplete or changed');offset=part.nextOffset;yield bytes;}}
  async function exportFile(kind:'web'|'android',name:string,payload:Record<string,any>){
    const filename=name==='project.export-subtitles'?(payload.draft?'subtitle-drafts.zip':'subtitles.zip'):String(payload.assetPath).split('/').pop()!;
    const web=window as unknown as {showSaveFilePicker?:(options:{suggestedName:string})=>Promise<{createWritable:()=>Promise<{write:(bytes:Uint8Array)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>}>};
    // Ask for a streaming Save File handle on large media exports while user activation is active; bounded subtitle/text/workbook exports use standard browser downloads so Safari, Firefox and WebViews also work.
    let file:Awaited<ReturnType<NonNullable<typeof web.showSaveFilePicker>>>|undefined;
    const useBlobDownload=kind==='web'&&(name==='project.export-subtitles'||BLOB_EXPORT_EXT.test(filename)||!web.showSaveFilePicker);
    if(kind==='web'&&!useBlobDownload){
      try{file=await web.showSaveFilePicker!({suggestedName:filename});}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return {canceled:true};throw error;}
    }
    const relativePath=name==='project.export-subtitles'?(await command<{relativePath:string}>(name,payload)).relativePath:payload.assetPath;
    const media=await call<Media>('media.open',{projectId:payload.projectId,relativePath,draft:payload.subtitleDraft===true||payload.draft===true});
    try{
      if(kind==='android'){const {saveAndroidFile}=await import('./android-save.js');return await saveAndroidFile(mediaBytes(media),filename,media.mediaType,media.size,scope.signal);}
      if(!file){
        if(media.size>MAX_BLOB_EXPORT_BYTES)throw new Error('This browser cannot stream large exports to a chosen file. Use a browser with Save File support or export in the PC App.');
        const chunks:BlobPart[]=[];let written=0;
        for await(const bytes of mediaBytes(media)){chunks.push(bytes.slice());written+=bytes.length;}
        scope.signal.throwIfAborted();
        if(written!==media.size)throw new Error('Incomplete export');
        const url=URL.createObjectURL(new Blob(chunks,{type:media.mediaType||'application/octet-stream'}));
        const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.rel='noopener';anchor.hidden=true;
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60_000);
        return {canceled:false,bytes:written};
      }
      const writer=await file.createWritable();let written=0;
      try{for await(const bytes of mediaBytes(media)){await writer.write(bytes);written+=bytes.length;}scope.signal.throwIfAborted();if(written!==media.size)throw new Error('Incomplete export');await writer.close();return {canceled:false,bytes:written};}catch(error){await writer.abort().catch(()=>{});throw error;}
    }finally{await call('media.close',{id:media.id}).catch(()=>{});}
  }
  return {call,exportFile};
}
