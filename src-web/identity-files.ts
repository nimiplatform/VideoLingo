import type {FileChoiceIntent} from '../src-component/workspace-files.js';
export type FileBinding={targetRef:string;viewKey:string;signal:AbortSignal;send:(value:unknown)=>void};
export type FileSelection={id:string;intent:FileChoiceIntent;targetRef:string;files:File[];state:'selected'|'delivering'|'unconfirmed';error?:string};

/** Owns user-selected Files and UI drafts for one real identity, never an SDK client or workflow. */
export class IdentityFiles {
  private drafts=new Map<string,Map<string,unknown>>();
  private binding:FileBinding|undefined;
  private readyInputs=new Set<string>();
  private choosing:{intent:FileChoiceIntent;targetRef:string}|undefined;
  private selection:FileSelection|undefined;
  private listeners=new Set<()=>void>();
  private revision=0;
  getRevision=()=>this.revision;
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private identity:AbortSignal,private open:(intent:FileChoiceIntent)=>void){identity.addEventListener('abort',()=>{this.binding=undefined;this.choosing=undefined;this.selection=undefined;this.drafts.clear();if(this.timer)clearTimeout(this.timer);this.notify();},{once:true});}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  getSnapshot=()=>this.selection;
  private notify(){this.revision++;for(const listener of this.listeners)listener();}
  setBinding(binding:FileBinding){if(this.identity.aborted||binding.signal.aborted)return;this.binding=binding;this.readyInputs.clear();binding.signal.addEventListener('abort',()=>{if(this.binding!==binding)return;this.binding=undefined;this.readyInputs.clear();if(this.selection?.state==='delivering')this.selection={...this.selection,state:'unconfirmed',error:'Connection ended after upload was requested. Check the PC project; this work will not be replayed.'};this.notify();},{once:true});this.notify();}
  inputReady(key:string,enabled:boolean,viewKey:string){if(this.binding?.viewKey!==viewKey||this.binding.signal.aborted)return;if(enabled)this.readyInputs.add(key);else this.readyInputs.delete(key);this.notify();}
  saveDraft(targetRef:string,key:string,value:unknown){if(this.identity.aborted||typeof key!=='string'||key.length>250||JSON.stringify(value)?.length>64*1024**2)return;let values=this.drafts.get(targetRef);if(!values){values=new Map();this.drafts.set(targetRef,values);}values.set(key,structuredClone(value));}
  snapshot(targetRef:string){return Object.fromEntries(this.drafts.get(targetRef)||[]);}
  choose(intent:FileChoiceIntent,targetRef:string,viewKey:string,drafts:Record<string,unknown>){
    if(this.identity.aborted||this.binding?.signal.aborted||this.binding?.viewKey!==viewKey||this.binding?.targetRef!==targetRef)throw new Error('Reconnect the original PC workspace before choosing a file');
    for(const [key,value] of Object.entries(drafts))this.saveDraft(targetRef,key,value);
    this.choosing={intent,targetRef};this.open(intent);
  }
  selected(files:File[]){const choosing=this.choosing;this.choosing=undefined;if(this.identity.aborted||!choosing||!files.length)return;if(!choosing.intent.multiple&&files.length!==1)throw new Error('Choose one file');this.selection={id:crypto.randomUUID(),...choosing,files,state:'selected'};this.notify();}
  canceled(){this.choosing=undefined;}
  canDeliver(){return !!this.selection&&this.selection.state==='selected'&&!this.identity.aborted&&!!this.binding&&!this.binding.signal.aborted&&this.binding.targetRef===this.selection.targetRef&&this.readyInputs.has(this.selection.intent.key);}
  deliver(){
    if(!this.canDeliver())throw new Error('Restore the original PC connection before uploading');
    const binding=this.binding!,selection=this.selection!;this.selection={...selection,state:'delivering'};this.notify();
    binding.send({type:'selected-files',id:selection.id,key:selection.intent.key,files:selection.files});
    this.timer=setTimeout(()=>{if(this.selection?.id!==selection.id||this.selection.state!=='delivering')return;binding.send({type:'cancel-file-delivery',id:selection.id});this.selection={...this.selection,state:'unconfirmed',error:'The original file input was not confirmed. Inspect the current project before choosing the file again.'};this.notify();},10000);
  }
  acknowledged(id:string,viewKey:string,error?:string){if(this.identity.aborted||this.binding?.viewKey!==viewKey||this.selection?.id!==id)return;if(this.timer)clearTimeout(this.timer);this.selection=error?{...this.selection,state:'unconfirmed',error}:undefined;this.notify();}
  discard(){if(this.selection?.state==='delivering')return;this.selection=undefined;this.notify();}
}
