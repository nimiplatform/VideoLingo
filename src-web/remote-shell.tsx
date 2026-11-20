import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {NimiAppSessionProvider,NimiAppAccessGate,NimiAccountControl,useNimiAppSession,type NimiAppSession,type NimiAppScope} from '@nimiplatform/kit/auth/app';
import {NimiThemeProvider,TooltipProvider,Popover,PopoverTrigger,PopoverContent,Button} from '@nimiplatform/kit/ui';
import {remoteVideoLingoSession} from './remote-session.js';
import {IdentityFiles} from './identity-files.js';
import '../src-component/styles.css';
import './remote.css';
declare const __VIDEOLINGO_WEB_SCOPE__:string|undefined;
const WEB_SCOPE=typeof __VIDEOLINGO_WEB_SCOPE__==='string'?__VIDEOLINGO_WEB_SCOPE__:'/';
function Workspace({scope,kind,locale,files,reportSave}:{scope:NimiAppScope;kind:'web'|'android';locale:'zh'|'en';files:IdentityFiles;reportSave:(message:string)=>void}){
  const frame=useRef<HTMLIFrameElement>(null),[target,setTarget]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const documentKey=useRef(crypto.randomUUID());
  useEffect(()=>{const control=new AbortController(),signal=AbortSignal.any([scope.signal,control.signal]);let port:MessagePort|undefined;let remote:ReturnType<typeof remoteVideoLingoSession>|undefined;
    let selected='';const viewKey=scope.viewKey+':'+documentKey.current+':'+attempt;
    const receive=(event:MessageEvent)=>{if(port||event.source!==frame.current?.contentWindow||event.origin!==location.origin||event.data!=='videolingo-ready'||!remote)return;const channel=new MessageChannel();port=channel.port1;const captured=remote;
      files.setBinding({targetRef:selected,viewKey,signal,send:value=>port?.postMessage(value)});
      port.onmessage=event=>{if(signal.aborted)return;const message=event.data;
        if(message.type==='draft'){files.saveDraft(selected,message.key,message.value);return;}
        if(message.type==='file-input'){files.inputReady(message.key,message.enabled===true,viewKey);return;}
        if(message.type==='pick-files'){try{files.choose(message.intent,selected,viewKey,message.drafts||{});}catch(error){setError(String(error));}return;}
        if(message.type==='file-accepted'){files.acknowledged(message.id,viewKey,message.error);return;}
        const operation=async()=>{
          if(message.operation!=='client.export')return captured.call(message.operation,message.input);
          reportSave(locale==='zh'?'正在保存文件到此设备…':'Saving the file to this device…');
          try{const result=await captured.exportFile(kind,message.input.command,message.input.payload);reportSave(result.canceled?(locale==='zh'?'已取消保存，PC 原文件保留。':'File saving was canceled. The original remains on the PC.'):(locale==='zh'?'文件已保存到所选位置。':'The file was saved to the selected destination.'));return result;}
          catch(error){reportSave(String(error));throw error;}
        };
        void operation().then(result=>{if(!signal.aborted)port?.postMessage({id:message.id,result});},error=>port?.postMessage({id:message.id,error:String(error)}));};port.start();frame.current!.contentWindow!.postMessage({type:'videolingo-connect',kind,locale,drafts:files.snapshot(selected)},location.origin,[channel.port2]);};
    window.addEventListener('message',receive);signal.addEventListener('abort',()=>{port?.postMessage({ended:true});port?.close();},{once:true});
    void (async()=>{try{const values=(await scope.client.integration.listCatalog()).filter(value=>value.integrationId==='videolingo.workspace.v1'&&value.available&&value.permittedOperations.includes('inspect'));if(values.length!==1)throw new Error('Open VideoLingo on the PC and allow this source in Home → Integrations.');selected=values[0].targetRef;remote=remoteVideoLingoSession({...scope,signal},selected);await remote.call('inspect');await navigator.serviceWorker.register(WEB_SCOPE+'videolingo-media-worker.js',{scope:WEB_SCOPE});await navigator.serviceWorker.ready;signal.throwIfAborted();setError('');setTarget(selected);}catch(error){if(!signal.aborted)setError(String(error));}})();
    return()=>{control.abort();window.removeEventListener('message',receive);};
  },[scope,kind,locale,attempt,files,reportSave]);
  return <><p className="vl-remote-note">{locale==='zh'?'保持 PC 上的 VideoLingo 运行。这里读取并编辑原 PC 项目；AI、批次和文件处理仍在 PC 完成，导出保存到当前设备。':'Keep VideoLingo open on your PC. This device reads and edits those original projects; AI, batches and media processing stay on the PC. Exports save to this device.'}</p>{error&&<div role="alert" className="vl-error">{error}<Button tone="secondary" onClick={()=>{setTarget('');setAttempt(value=>value+1);}}>{locale==='zh'?'重试':'Retry'}</Button></div>}{target&&<iframe ref={frame} key={target+':'+attempt} title="VideoLingo workspace" src={WEB_SCOPE+'workspace.html'}/>}</>;
}
function Account({locale}:{locale:'zh'|'en'}){const {snapshot}=useNimiAppSession();if(snapshot.identity.status!=='signed-in')return null;return <Popover><PopoverTrigger asChild><Button tone="secondary" size="sm">{snapshot.identity.user?.displayName||'Nimi'}</Button></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-4"><NimiAccountControl language={locale}/></PopoverContent></Popover>;}
function IdentityWorkspace({kind,locale,identitySignal}:{kind:'web'|'android';locale:'zh'|'en';identitySignal:AbortSignal}){
  const input=useRef<HTMLInputElement>(null);
  const [saved,setSaved]=useState('');
  const [reportSave]=useState(()=>(message:string)=>{if(!identitySignal.aborted)setSaved(message);});
  const [files]=useState(()=>new IdentityFiles(identitySignal,intent=>{const element=input.current;if(!element)throw new Error('File selection is unavailable');element.accept=intent.accept;element.multiple=intent.multiple;element.click();}));
  useSyncExternalStore(files.subscribe,files.getRevision);
  const selection=files.getSnapshot();
  useEffect(()=>{const element=input.current;if(!element)return;const cancel=()=>files.canceled();element.addEventListener('cancel',cancel);return()=>element.removeEventListener('cancel',cancel);},[files]);
  return <><input ref={input} type="file" hidden aria-label="Android file selection" onChange={event=>{const chosen=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';files.selected(chosen);}}/>
    {selection&&<section className="vl-file-selection" aria-live="polite"><strong>{selection.files.map(file=>file.name).join(', ')}</strong><p>{locale==='zh'?'已保留所选文件。恢复原 PC 连接后，点击继续上传；不会自动发送或重做任务。':'The selected files are retained. Reconnect the original PC, then continue upload explicitly. No work is replayed automatically.'}</p>{selection.error&&<p role="alert">{selection.error}</p>}<div><Button disabled={!files.canDeliver()} onClick={()=>files.deliver()}>{locale==='zh'?'继续上传':'Continue upload'}</Button><Button tone="secondary" disabled={selection.state==='delivering'} onClick={()=>files.discard()}>{locale==='zh'?'取消选择':'Discard selection'}</Button></div></section>}
    {saved&&<p className="vl-file-selection" role="status">{saved}</p>}
    <NimiAppAccessGate title="VideoLingo" language={locale}>{scope=><Workspace key={scope.viewKey+locale} scope={scope} kind={kind} locale={locale} files={files} reportSave={reportSave}/>}</NimiAppAccessGate>
  </>;
}
function Shell({kind}:{kind:'web'|'android'}){const {snapshot}=useNimiAppSession();const identity=snapshot.identity.status==='signed-in'?snapshot.identity:null;const [locale,setLocale]=useState<'zh'|'en'>(navigator.language.startsWith('zh')?'zh':'en');return <div className="vl-remote-shell"><header><strong>VideoLingo</strong><div><Button tone="secondary" size="sm" onClick={()=>setLocale(value=>value==='zh'?'en':'zh')}>{locale==='zh'?'English':'中文'}</Button><Account locale={locale}/></div></header><NimiAppAccessGate title="VideoLingo" language={locale} requireRuntime={false}>{identity&&<IdentityWorkspace key={identity.viewKey} kind={kind} locale={locale} identitySignal={identity.signal}/>}</NimiAppAccessGate></div>;}
export function mountRemoteVideoLingo(session:NimiAppSession,kind:'web'|'android'){const root=createRoot(document.getElementById('root')!);root.render(<NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><NimiAppSessionProvider session={session}><Shell kind={kind}/></NimiAppSessionProvider></TooltipProvider></NimiThemeProvider>);void session.start();return()=>{root.unmount();session.dispose();};}
