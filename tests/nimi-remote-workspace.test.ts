import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {RemoteVideoLingoWorkspace,MAX_SOURCE_BYTES} from '../src-electron/remote-workspace.ts';
import {remoteVideoLingoSession} from '../src-web/remote-session.ts';

const PROJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',UPLOAD='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'videolingo-remote-test-')),files=new Map<string,Buffer>();
  const project={id:PROJECT,source:{assetPath:`projects/${PROJECT}/input/original.mp4`},outputPaths:[] as string[],downloadInput:{cookiesAssetPath:`projects/${PROJECT}/download-cookies/${UPLOAD}.txt`}};
  let saved:unknown;
  const stat=(relativePath:string)=>{const bytes=files.get(relativePath);if(!bytes)throw new Error('Missing asset');return {relativePath,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mediaType:'application/octet-stream'};};
  const services={integration:{registerProvider:async()=>{},pollProvider:()=>new Promise(()=>{})},aiConfig:{get:async()=>({revision:7})},storage:{assets:{
    write:async(input:{relativePath:string;body:AsyncIterable<Uint8Array>})=>{if(files.has(input.relativePath))throw new Error('Asset exists');const chunks:Buffer[]=[];for await(const bytes of input.body)chunks.push(Buffer.from(bytes));files.set(input.relativePath,Buffer.concat(chunks));return stat(input.relativePath);},
    remove:async(relativePath:string)=>{files.delete(relativePath);return {removed:true};},
    read:async({relativePath,offset,length}:{relativePath:string;offset:number;length:number})=>({asset:stat(relativePath),range:{offset,length,totalSize:files.get(relativePath)!.length},body:(async function*(){yield files.get(relativePath)!.subarray(offset,offset+length);})()}),
  }}};
  const projects={get:async()=>project,list:async()=>[project],exportInfo:async(_id:string,relativePath:string)=>stat(relativePath),saveSubtitles:async(_id:string,value:unknown)=>{saved=value;return {saved:true};}};
  const provider=new RemoteVideoLingoWorkspace(services as never,projects as never,{} as never,root);
  await new Promise(resolve=>setTimeout(resolve,5));
  return {provider,project,files,saved:()=>saved,close:async()=>{await provider.close();await rmdir(root);}};
}
async function upload(provider:RemoteVideoLingoWorkspace,body:Buffer,relativePath=''){
  const {id}=await provider.dispatch('caller-a','upload',{action:relativePath?'begin':'begin-json',size:body.length,...relativePath?{relativePath,mediaType:'application/octet-stream'}:{}}) as {id:string};
  for(let offset=0;offset<body.length;offset+=65536)await provider.dispatch('caller-a','upload',{action:'append',id,offset,data:body.subarray(offset,offset+65536).toString('base64')});
  await provider.dispatch('caller-a','upload',{action:'finish',id});
  for(let count=0;count<100;count++){const result=await provider.dispatch('caller-a','upload',{action:'read',id}) as {state:string;error?:string};if(result.state==='completed')return id;if(result.state==='failed')throw new Error(result.error);await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Upload did not complete');
}

test('retains the exact four-GiB input boundary without allocating or pretending to transfer that amount',async()=>{
  const f=await fixture();try{
    const path=`projects/${PROJECT}/input/${UPLOAD}.mp4`;
    const {id}=await f.provider.dispatch('caller-a','upload',{action:'begin',relativePath:path,size:MAX_SOURCE_BYTES}) as {id:string};
    assert.equal((await f.provider.dispatch('caller-a','upload',{action:'read',id}) as {received:number}).received,0);
    await assert.rejects(f.provider.dispatch('caller-a','upload',{action:'begin',relativePath:path,size:MAX_SOURCE_BYTES+1}));
    await f.provider.dispatch('caller-a','upload',{action:'abort',id});assert.equal(f.files.size,0);assert.equal(f.project.source.assetPath,`projects/${PROJECT}/input/original.mp4`);
  }finally{await f.close();}
});
test('streams ordered input bytes, refuses another consumer, and keeps a bound original source',async()=>{
  const f=await fixture();try{
    const path=`projects/${PROJECT}/input/${UPLOAD}.mp4`,body=Buffer.alloc(200000,27);
    const {id}=await f.provider.dispatch('caller-a','upload',{action:'begin',relativePath:path,size:body.length}) as {id:string};
    await assert.rejects(f.provider.dispatch('caller-b','upload',{action:'append',id,offset:0,data:'YQ=='}),/Unknown/);
    await assert.rejects(f.provider.dispatch('caller-a','upload',{action:'append',id,offset:1,data:'YQ=='}),/order/);
    await f.provider.dispatch('caller-a','upload',{action:'abort',id});
    await upload(f.provider,body,path);assert.deepEqual(f.files.get(path),body);
    f.project.source.assetPath=path;
    await assert.rejects(f.provider.dispatch('caller-a','upload.remove',{relativePath:path}),/already owns/);assert.deepEqual(f.files.get(path),body);
  }finally{await f.close();}
});
test('stages a large four-SRT edit once instead of truncating it to the Integration JSON limit',async()=>{
  const f=await fixture();try{
    const original={projectId:PROJECT,input:{translationKey:'original-translation',revision:'original-revision',display:{source:'字幕\n'.repeat(50000),translation:'translation\n'.repeat(30000)},dubbing:{source:'spoken\n'.repeat(30000),translation:'spoken translation\n'.repeat(20000)}}};
    const body=Buffer.from(JSON.stringify(original));assert.ok(body.length>256*1024);
    const payloadId=await upload(f.provider,body);
    await assert.rejects(f.provider.dispatch('caller-b','projects.write',{command:'project.save-subtitles',payloadId}),/Unknown/);
    const {id}=await f.provider.dispatch('caller-a','projects.write',{command:'project.save-subtitles',payloadId}) as {id:string};
    for(let count=0;count<100&&!f.saved();count++)await new Promise(resolve=>setTimeout(resolve,2));
    assert.deepEqual(f.saved(),original.input);
    await assert.rejects(f.provider.dispatch('caller-a','projects.write',{command:'project.save-subtitles',payloadId}),/Unknown/);
    assert.equal((await f.provider.dispatch('caller-b','result.read',{id,offset:0}) as {state:string}).state,'unknown');
  }finally{await f.close();}
});
test('exposes only visible project media, never cookie contents or another caller’s range reference',async()=>{
  const f=await fixture();try{
    const secret=f.project.downloadInput.cookiesAssetPath;f.files.set(secret,Buffer.from('private website cookies'));
    await assert.rejects(f.provider.dispatch('caller-a','media.open',{projectId:PROJECT,relativePath:secret}),/Cookie/);
    const result=`projects/${PROJECT}/output/result.wav`,body=Buffer.alloc(200000,9);f.files.set(result,body);f.project.outputPaths.push(result);
    const {id}=await f.provider.dispatch('caller-a','media.open',{projectId:PROJECT,relativePath:result}) as {id:string};
    await assert.rejects(f.provider.dispatch('caller-b','media.read',{id,offset:0,length:100}),/Unknown/);
    const part=await f.provider.dispatch('caller-a','media.read',{id,offset:131072,length:131072}) as {data:string;nextOffset:number};assert.deepEqual(Buffer.from(part.data,'base64'),body.subarray(131072));assert.equal(part.nextOffset,body.length);
    await assert.rejects(f.provider.dispatch('caller-a','media.read',{id,offset:0,length:131073}),/range/);
  }finally{await f.close();}
});
test('downloads bounded Web subtitles via anchor while keeping showSaveFilePicker streaming and size guards for videos',async()=>{
  const srtBytes=Buffer.from('1\n00:00:00,000 --> 00:00:02,000\n双语字幕\nBilingual subtitle\n','utf8');
  const srtSha=createHash('sha256').update(srtBytes).digest('hex');
  const closed:string[]=[];
  let clickedDownload='',pickerCalls=0,streamedBytes=0;
  const prevWin=(globalThis as Record<string,unknown>).window,prevDoc=(globalThis as Record<string,unknown>).document;
  try{
    (globalThis as Record<string,unknown>).window={};
    (globalThis as Record<string,unknown>).document={
      createElement:()=>({href:'',download:'',rel:'',hidden:false,click(){clickedDownload=this.download;},remove(){}}),
      body:{appendChild(){}},
    };
    const makeSession=(size:number,bytes:Buffer)=>remoteVideoLingoSession({
      signal:new AbortController().signal,
      client:{integration:{invoke:async({operation,inputJson}:{operation:string;inputJson:string})=>{
        const input=JSON.parse(inputJson||'{}');
        if(operation==='media.open')return {status:'completed',resultJson:JSON.stringify({id:'m1',size,sha256:srtSha,mediaType:'text/plain',name:'src_trans.srt'})};
        if(operation==='media.read')return {status:'completed',resultJson:JSON.stringify({offset:input.offset,nextOffset:bytes.length,size,sha256:srtSha,data:bytes.toString('base64')})};
        if(operation==='media.close'){closed.push(input.id);return {status:'completed',resultJson:'{"closed":true}'};}
        throw new Error('Unexpected '+operation);
      }}},
    } as never,'target-pc');
    const res=await makeSession(srtBytes.length,srtBytes).exportFile('web','project.export',{projectId:PROJECT,assetPath:`projects/${PROJECT}/output/src_trans.srt`});
    assert.deepEqual(res,{canceled:false,bytes:srtBytes.length});
    assert.equal(clickedDownload,'src_trans.srt');
    assert.deepEqual(closed,['m1']);

    await assert.rejects(
      makeSession(33*1024*1024,srtBytes).exportFile('web','project.export',{projectId:PROJECT,assetPath:`projects/${PROJECT}/output/output_sub.mp4`}),
      /cannot stream large exports/
    );

    (globalThis as Record<string,unknown>).window={
      showSaveFilePicker:async({suggestedName}:{suggestedName:string})=>{
        pickerCalls++;assert.equal(suggestedName,'output_sub.mp4');
        return {createWritable:async()=>({write:async(chunk:Uint8Array)=>{streamedBytes+=chunk.byteLength;},close:async()=>{},abort:async()=>{}})};
      },
    };
    const vidRes=await makeSession(srtBytes.length,srtBytes).exportFile('web','project.export',{projectId:PROJECT,assetPath:`projects/${PROJECT}/output/output_sub.mp4`});
    assert.deepEqual(vidRes,{canceled:false,bytes:srtBytes.length});
    assert.equal(pickerCalls,1);
    assert.equal(streamedBytes,srtBytes.length);
  }finally{
    if(prevWin===undefined)delete (globalThis as Record<string,unknown>).window;else (globalThis as Record<string,unknown>).window=prevWin;
    if(prevDoc===undefined)delete (globalThis as Record<string,unknown>).document;else (globalThis as Record<string,unknown>).document=prevDoc;
  }
});
