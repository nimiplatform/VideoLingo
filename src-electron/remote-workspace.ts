// @nimi-authority: rule.nimi.sdks.feature-clients.integrations
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';
import { Projects } from './projects.js';
import { Batches } from './batches.js';
import { projectId, type DubbingInput, type DownloadInput, type TranslationInput, type PreviewInput } from './project-types.js';
import type { SubtitleSaveInput } from './subtitles.js';
import type { BusinessSettings } from './business-settings.js';

export const VIDEO_WORKSPACE_ID = 'videolingo.workspace.v1';
export const MAX_SOURCE_BYTES = 4 * 1024 ** 3;
const CHUNK = 65536, READ_CHUNK = 131072;
const READ_COMMANDS = ['projects.list', 'project.get', 'project.subtitles', 'batches.list', 'batch.get'];
const WRITE_COMMANDS = ['project.create','project.update-dubbing-settings','project.update-settings','project.archive','project.clear','project.run-subtitles','project.run-dubbing','project.attach-media','project.download-url','batch.read-task-sheet','project.transcribe','project.separate','project.split-nlp','project.translate','project.save-subtitles','project.dub','project.render-subtitles','project.prepare-preview','batch.create','batch.resume','batch.pause','batch.stop','project.preview','project.pause','project.cancel','project.export-subtitles'];
const schema=(properties:Record<string,unknown>,required:string[]=[])=>JSON.stringify({type:'object',additionalProperties:false,properties,required});
const idSchema={type:'string',pattern:'^[a-zA-Z0-9-]+$',minLength:8,maxLength:80};
const offsetSchema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const descriptor=(name:string,effect:'read'|'write',properties:Record<string,unknown>,required:string[],description:string)=>({name,displayName:name,effect,inputSchemaJson:schema(properties,required),outputSchemaJson:'{"type":"object","additionalProperties":true}',description,supportsCancel:false,retryPolicy:'none'});
type Upload={owner:string;file:string;relativePath:string;size:number;received:number;mediaType:string;state:'uploading'|'writing'|'completed'|'failed';created:boolean;error?:string;work?:Promise<void>;control:AbortController;claimed?:boolean;lastActivity:number};
type ResponseRecord={owner:string;lastActivity:number;state:'pending'|'completed'|'failed';bytes?:Buffer;error?:string};
type MediaRecord={owner:string;lastActivity:number;relativePath:string;size:number;sha256:string;mediaType:string};

function uploadLimit(relativePath:string):number {
  const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if(new RegExp(`^projects/${uuid}/input/${uuid}\\.(mp4|mov|avi|mkv|flv|wmv|webm|wav|mp3|flac|m4a)$`).test(relativePath))return MAX_SOURCE_BYTES;
  if(new RegExp(`^projects/${uuid}/voice-reference/${uuid}\\.(wav|mp3)$`).test(relativePath))return 20*1024**2;
  if(new RegExp(`^(projects/${uuid}/terms|batch-imports)/${uuid}\\.xlsx$`).test(relativePath))return 5*1024**2;
  if(new RegExp(`^projects/${uuid}/download-cookies/${uuid}\\.txt$`).test(relativePath))return 1024**2;
  throw new Error('Choose a VideoLingo project input or task sheet');
}
function references(value:unknown,assetPath:string):boolean {return value===assetPath||!!value&&typeof value==='object'&&Object.values(value).some(item=>references(item,assetPath));}
function bytes(value:unknown):Buffer {if(typeof value!=='string'||value.length>87384||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid media chunk');const data=Buffer.from(value,'base64');if(!data.length||data.length>CHUNK)throw new Error('Media chunks must be at most 64 KiB');return data;}

/** The existing PC Projects/Batches remain the only workflow and managed-file owners. */
export class RemoteVideoLingoWorkspace {
  private closed=false;
  private uploads=new Map<string,Upload>();
  private responses=new Map<string,ResponseRecord>();
  private media=new Map<string,MediaRecord>();
  private tasks=new Set<Promise<void>>();
  private exportPermits=new Map<string,{owner:string;lastActivity:number}>();
  private sweep:ReturnType<typeof setInterval>;
  constructor(private services:NimiElectronAppBusinessServices,private projects:Projects,private batches:Batches,private directory:string){this.sweep=setInterval(()=>void this.expireTransfers().catch(error=>console.warn('VideoLingo temporary transfer cleanup failed',error)),15000);this.sweep.unref();void this.run();}
  private async expireTransfers(){const now=Date.now();for(const [key,item] of this.exportPermits)if(now-item.lastActivity>300000)this.exportPermits.delete(key);for(const [id,item] of this.media)if(now-item.lastActivity>60000)this.media.delete(id);for(const [id,item] of this.responses)if(now-item.lastActivity>300000)this.responses.delete(id);for(const [id,item] of this.uploads)if(item.state!=='writing'&&now-item.lastActivity>300000){this.uploads.delete(id);await rm(item.file,{force:true});}}

  private async run(){
    try{
      await mkdir(this.directory,{recursive:true});
      await this.services.integration.registerProvider({integrationId:VIDEO_WORKSPACE_ID,displayName:'VideoLingo PC workspace',skill:'Operate the existing VideoLingo projects and batches on this PC. AI configuration, model calls, original managed files, stage checkpoints and Job recovery remain on this PC. Read permission reveals this library; write permission changes it and can start the selected subtitle or dubbing workflows. Use original project/batch IDs after interruption. Temporary transfers are bound to the Runtime-verified consumer. Never replay uncertain writes, pass arbitrary filesystem paths, or proxy Runtime methods.',operations:[
        descriptor('inspect','read',{},[],'Read the actual protected PC App AI configuration. Project reads keep using the PC managed storage.'),
        descriptor('projects.read','read',{command:{type:'string',enum:READ_COMMANDS},payload:{type:'object',additionalProperties:true},payloadId:idSchema},['command'],'Start one explicit library/project/batch read and retrieve its original result.'),
        descriptor('projects.write','write',{command:{type:'string',enum:WRITE_COMMANDS},payload:{type:'object',additionalProperties:true},payloadId:idSchema},['command'],'Execute one explicit VideoLingo project or batch action. Original pause/cancel/resume and subtitle proofreading rules apply. Large four-SRT revisions and original batch inputs use one caller-bound staged JSON body.'),
        descriptor('result.read','read',{id:idSchema,offset:offsetSchema},['id','offset'],'Read the original operation result in bounded 128 KiB ranges. Unknown is not success.'),
        descriptor('result.release','write',{id:idSchema},['id'],'Release only this caller’s delivered transport result, never project data.'),
        descriptor('upload','write',{action:{type:'string',enum:['begin','begin-json','append','finish','read','abort']},id:idSchema,relativePath:{type:'string',maxLength:500},mediaType:{type:'string',maxLength:128},size:{type:'integer',minimum:1,maximum:MAX_SOURCE_BYTES},offset:offsetSchema,data:{type:'string',maxLength:87384}},['action'],'Stream a source up to the original 4 GiB limit, reference up to 20 MiB, workbook up to 5 MiB or cookies up to 1 MiB. Business JSON may be staged up to 64 MiB and consumed once. No overwrite is accepted.'),
        descriptor('upload.remove','write',{relativePath:{type:'string',maxLength:500}},['relativePath'],'Remove this caller’s newly imported, still-unbound asset after a failed import; never remove a bound project reference.'),
        descriptor('media.open','read',{projectId:idSchema,relativePath:{type:'string',maxLength:1000},draft:{type:'boolean'}},['projectId','relativePath'],'Check existing project membership and proofreading/export conditions before issuing a caller-bound media reference.'),
        descriptor('media.read','read',{id:idSchema,offset:offsetSchema,length:{type:'integer',minimum:1,maximum:READ_CHUNK}},['id','offset','length'],'Read actual managed media ranges without publishing native paths or credentials.'),
        descriptor('media.renew','read',{ids:{type:'array',maxItems:64,items:idSchema}},['ids'],'Maintain only this caller’s currently visible media references. Abandoned handles expire without deleting files.'),
        descriptor('media.close','read',{id:idSchema},['id'],'Release a caller’s temporary media reference, preserving the original asset.'),
        descriptor('voices.list','read',{kind:{type:'string',enum:['preset','asset']}},['kind'],'List actual preset or active VoiceAssets available to the PC App configuration.'),
      ]});
      while(!this.closed){const batch=await this.services.integration.pollProvider({waitMs:25000});for(const call of batch.calls){if(this.closed)return;let resultJson='{}',errorCode='';try{resultJson=JSON.stringify(await this.dispatch(call.consumerRef,call.operation,JSON.parse(call.inputJson)));}catch(error){errorCode='VIDEOLINGO_WORKSPACE_FAILED';resultJson=JSON.stringify({error:error instanceof Error?error.message:String(error)});}if(!this.closed)try{await this.services.integration.completeProvider({callId:call.callId,resultJson,errorCode});}catch(error){console.warn('VideoLingo result delivery failed; the operation was not replayed',error);}}}
    }catch(error){if(!this.closed)console.warn('VideoLingo workspace provider unavailable',error);}
  }
  private owned<T extends {owner:string}>(map:Map<string,T>,owner:string,id:string){const value=map.get(id);if(!value||value.owner!==owner)throw new Error('Unknown VideoLingo transfer');return value;}
  async dispatch(owner:string,operation:string,input:Record<string,any>):Promise<unknown>{
    if(this.closed||!owner)throw new Error('VideoLingo PC scope ended');
    if(operation==='inspect')return {configuration:await this.services.aiConfig.get()};
    if(operation==='voices.list'){
      if(input.kind==='preset'){const result=await this.services.aiConfig.listOptions({kind:'preset-voices'});return {voices:result.kind==='preset-voices'?result.options.map(item=>({id:item.voiceId,label:item.name})):[]};}
      if(input.kind!=='asset')throw new Error('Unknown voice list');return {voices:(await this.services.ai.voiceAssets.list({pageSize:100})).assets.filter(item=>item.status==='active').map(item=>({id:item.voiceAssetId,label:item.voiceAssetId}))};
    }
    if(operation==='projects.read'||operation==='projects.write'){
      const allowed=operation==='projects.read'?READ_COMMANDS:WRITE_COMMANDS;
      if(!allowed.includes(input.command)||this.responses.size>=128)throw new Error('Unsupported command or too many retained results');
      let payload=input.payload||{};
      if(input.payloadId){const upload=this.owned(this.uploads,owner,input.payloadId);if(upload.relativePath||upload.state!=='completed'||upload.claimed||input.payload)throw new Error('Invalid or already consumed business payload');upload.claimed=true;try{payload=JSON.parse(await readFile(upload.file,'utf8'));if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Business payload must be an object');}finally{await rm(upload.file,{force:true});this.uploads.delete(input.payloadId);}}
      const id=randomUUID(),record:ResponseRecord={owner,lastActivity:Date.now(),state:'pending'};this.responses.set(id,record);
      const task=(async()=>{try{const result=await this.command(input.command,payload);if(this.closed)return;if(input.command==='project.export-subtitles'){const relativePath=(result as {relativePath:string}).relativePath;this.exportPermits.set(relativePath,{owner,lastActivity:Date.now()});}const bytes=Buffer.from(JSON.stringify(result??null));if(bytes.length>128*1024**2||[...this.responses.values()].reduce((sum,item)=>sum+(item.bytes?.length||0),0)+bytes.length>256*1024**2)throw new Error('Release retained project responses before reading more results');record.bytes=bytes;record.state='completed';}catch(error){record.error=error instanceof Error?error.message:String(error);record.state='failed';}})();this.tasks.add(task);void task.finally(()=>this.tasks.delete(task));return {id};
    }
    if(operation==='result.read'){const record=this.responses.get(input.id);if(!record||record.owner!==owner)return {state:'unknown'};record.lastActivity=Date.now();if(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>(record.bytes?.length||0))throw new Error('Invalid result range');const data=record.bytes?.subarray(input.offset,input.offset+READ_CHUNK)||Buffer.alloc(0);return {state:record.state,error:record.error,size:record.bytes?.length||0,offset:input.offset,nextOffset:input.offset+data.length,data:data.toString('base64')};}
    if(operation==='result.release'){const record=this.owned(this.responses,owner,input.id);if(record.state==='pending')throw new Error('Original operation is still running');this.responses.delete(input.id);return {released:true};}
    if(operation==='upload'){
      if(input.action==='begin'||input.action==='begin-json'){
        const relativePath=input.action==='begin-json'?'':input.relativePath,limit=relativePath?uploadLimit(relativePath):64*1024**2;
        const active=[...this.uploads.values()].filter(item=>item.state==='uploading'||item.state==='writing'||!item.relativePath);
        if(!Number.isSafeInteger(input.size)||input.size<1||input.size>limit||active.length>=8||active.reduce((sum,item)=>sum+item.size,0)+input.size>2*MAX_SOURCE_BYTES)throw new Error('Media exceeds the original input or active transfer limit');
        if(relativePath.startsWith('projects/'))await this.projects.get(projectId(relativePath.split('/')[1]));
        const id=randomUUID();this.uploads.set(id,{owner,file:path.join(this.directory,id),relativePath,size:input.size,received:0,mediaType:input.mediaType||'application/octet-stream',state:'uploading',created:false,control:new AbortController(),lastActivity:Date.now()});return {id};
      }
      const upload=this.owned(this.uploads,owner,input.id);upload.lastActivity=Date.now();
      if(input.action==='read')return {state:upload.state,received:upload.received,error:upload.error};
      if(input.action==='abort'){upload.control.abort();await upload.work;if(upload.created){if(upload.relativePath.startsWith('projects/')&&references(await this.projects.get(projectId(upload.relativePath.split('/')[1])),upload.relativePath))throw new Error('The project already owns this input');await this.services.storage.assets.remove(upload.relativePath);}await rm(upload.file,{force:true});this.uploads.delete(input.id);return {aborted:true};}
      if(input.action==='append'){if(upload.state!=='uploading'||input.offset!==upload.received)throw new Error('Upload chunks must arrive in order');const chunk=bytes(input.data);if(upload.received+chunk.length>upload.size)throw new Error('Upload exceeds declared size');await appendFile(upload.file,chunk);upload.received+=chunk.length;return {received:upload.received};}
      if(input.action!=='finish'||upload.state!=='uploading'||upload.received!==upload.size)throw new Error('Upload is incomplete or already submitted');
      if(!upload.relativePath){upload.state='completed';return {state:upload.state};}
      upload.state='writing';upload.work=(async()=>{try{const source=createReadStream(upload.file,{highWaterMark:CHUNK});const owner=this;async function* body(){for await(const part of source){if(owner.closed)throw new Error('VideoLingo scope ended');upload.control.signal.throwIfAborted();yield part as Buffer;}}await this.services.storage.assets.write({relativePath:upload.relativePath,body:body(),mediaType:upload.mediaType});upload.created=true;upload.state='completed';}catch(error){upload.error=error instanceof Error?error.message:String(error);upload.state='failed';}finally{await rm(upload.file,{force:true});}})();return {state:upload.state};
    }
    if(operation==='upload.remove'){
      const entry=[...this.uploads.entries()].find(([,item])=>item.owner===owner&&item.relativePath===input.relativePath&&item.created);
      if(!entry)throw new Error('This caller has no new asset at that path');
      if(input.relativePath.startsWith('projects/')){const project=await this.projects.get(projectId(input.relativePath.split('/')[1]));if(references(project,input.relativePath))throw new Error('The project already owns this input; preserve it and refresh the project');}
      await this.services.storage.assets.remove(input.relativePath);this.uploads.delete(entry[0]);return {removed:true};
    }
    if(operation==='media.open'){
      if(this.media.size>=64)throw new Error('Close old media previews first');
      const project=await this.projects.get(projectId(input.projectId));
      const visible=[project.source?.assetPath,project.mediaPreview?.assetPath,project.preview?.audioPath,project.preview?.resultPath,project.separation?.vocalsPath,project.separation?.backgroundPath,project.subtitleVideo?.assetPath,project.dubbingSettings?.referenceAssetPath,...project.outputPaths,...Object.values(project.translation?.files||{}),...Object.values(project.dubbing?.files||{}),...Object.values(project.subtitleRevision?.files||{})];
      const uploaded=[...this.uploads.values()].some(item=>item.owner===owner&&item.created&&item.relativePath===input.relativePath&&/\/(input|voice-reference)\//.test(item.relativePath));
      if(!visible.includes(input.relativePath)&&!uploaded&&this.exportPermits.get(input.relativePath)?.owner!==owner)throw new Error('Choose this project’s visible media or exported result. Cookie and internal settings files are not media.');
      const asset=await this.projects.exportInfo(project.id,input.relativePath,input.draft===true);const id=randomUUID();this.media.set(id,{owner,lastActivity:Date.now(),relativePath:input.relativePath,size:asset.sizeBytes,sha256:asset.sha256,mediaType:asset.mediaType||'application/octet-stream'});return {id,size:asset.sizeBytes,sha256:asset.sha256,mediaType:asset.mediaType||'application/octet-stream',name:path.posix.basename(input.relativePath)};
    }
    if(operation==='media.read'){
      const media=this.owned(this.media,owner,input.id);media.lastActivity=Date.now();if(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>=media.size||!Number.isInteger(input.length)||input.length<1||input.length>READ_CHUNK)throw new Error('Invalid media range');
      const length=Math.min(input.length,media.size-input.offset);const read=await this.services.storage.assets.read({relativePath:media.relativePath,offset:input.offset,length});if(read.asset.sha256!==media.sha256||read.range.offset!==input.offset||read.range.totalSize!==media.size||read.range.length!==length)throw new Error('The original media changed; reopen its current project result');let size=0;const chunks:Buffer[]=[];for await(const chunk of read.body){size+=chunk.length;if(size>length)throw new Error('Invalid media response size');chunks.push(Buffer.from(chunk));}if(size!==length)throw new Error('Incomplete media response');return {offset:input.offset,nextOffset:input.offset+size,size:media.size,sha256:media.sha256,data:Buffer.concat(chunks).toString('base64')};
    }
    if(operation==='media.renew'){for(const id of input.ids)this.owned(this.media,owner,id).lastActivity=Date.now();return {renewed:true};}
    if(operation==='media.close'){this.owned(this.media,owner,input.id);this.media.delete(input.id);return {closed:true};}
    throw new Error('Unknown VideoLingo operation');
  }
  private command(name:string,p:Record<string,any>):Promise<unknown>{
    const id=()=>projectId(p.projectId),batch=()=>projectId(p.batchId);
    switch(name){
      case 'projects.list':return this.projects.list();case 'project.get':return this.projects.get(id());case 'project.create':return this.projects.create(typeof p.title==='string'?p.title:'');
      case 'project.update-settings':return this.projects.updateSettings(id(),p.settings as BusinessSettings);case 'project.update-dubbing-settings':return this.projects.updateDubbingSettings(id(),p.input as DubbingInput);
      case 'project.archive':return this.projects.archive(id(),p.archived===true);case 'project.clear':return this.projects.clear(id(),p.kind);
      case 'project.run-subtitles':return this.batches.runProject(id(),'subtitles');case 'project.run-dubbing':return this.batches.runProject(id(),'dubbing',p.input as DubbingInput);
      case 'project.attach-media':return this.projects.attach(id(),p.name,p.uploadId);case 'project.download-url':return this.projects.downloadUrl(id(),p.input as DownloadInput);
      case 'batch.read-task-sheet':return this.projects.readTaskSheet(p.assetPath);case 'project.transcribe':return this.projects.start(id(),typeof p.languageHint==='string'?p.languageHint:'');
      case 'project.separate':return this.projects.separate(id());case 'project.split-nlp':return this.projects.splitNlp(id());case 'project.translate':return this.projects.translate(id(),p.input as TranslationInput);
      case 'project.subtitles':return this.projects.subtitles(id());case 'project.save-subtitles':return this.projects.saveSubtitles(id(),p.input as SubtitleSaveInput);
      case 'project.dub':return this.projects.dub(id(),p.input as DubbingInput);case 'project.render-subtitles':return this.projects.renderSubtitles(id());case 'project.prepare-preview':return this.projects.prepareMediaPreview(id());
      case 'batches.list':return this.batches.list();case 'batch.get':return this.batches.get(batch());case 'batch.create':return this.batches.create(typeof p.title==='string'?p.title:'',p.items);
      case 'batch.resume':return this.batches.resume(batch());case 'batch.pause':return this.batches.pause(batch());case 'batch.stop':return this.batches.stop(batch());
      case 'project.preview':return this.projects.preview(id(),p.input as PreviewInput);case 'project.pause':return this.projects.control(id(),'pause');case 'project.cancel':return this.projects.control(id(),'cancel');
      case 'project.export-subtitles':return this.projects.exportSubtitleZip(id(),p.draft===true).then(relativePath=>({relativePath}));
      default:throw new Error('Unknown VideoLingo business command');
    }
  }
  async close(){this.closed=true;clearInterval(this.sweep);for(const upload of this.uploads.values())upload.control.abort();await Promise.allSettled([...this.tasks,...[...this.uploads.values()].flatMap(item=>item.work?[item.work]:[])]);for(const item of this.uploads.values())await rm(item.file,{force:true});this.uploads.clear();this.responses.clear();this.media.clear();}
}
