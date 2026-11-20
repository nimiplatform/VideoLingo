import React,{useLayoutEffect,useRef,useState,type Dispatch,type SetStateAction,type InputHTMLAttributes} from 'react';
import {Button} from '@nimiplatform/kit/ui';
import {useVideoLingoPlatform} from './platform.js';
export type FileChoiceIntent={key:string;accept:string;multiple:boolean;label:string};
export type WorkspaceFiles={choose(intent:FileChoiceIntent):void;subscribe(key:string,enabled:boolean,receive:(files:File[])=>void):()=>void};
export type WorkspaceDrafts={read(key:string):unknown;write(key:string,value:unknown):void};

/** UI drafts only. Saved projects, queues, stage state and Jobs remain PC-owned. */
export function useWorkspaceDraft<T>(key:string,initial:()=>T):[T,Dispatch<SetStateAction<T>>]{
  const platform=useVideoLingoPlatform();
  const [value,setValue]=useState<T>(()=>{const saved=platform.drafts?.read(key);return saved===undefined?initial():saved as T;});
  useLayoutEffect(()=>{platform.drafts?.write(key,value);},[platform,key,value]);
  return [value,setValue];
}
export function WorkspaceFileInput({inputKey,pickerLabel,onFiles,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'onChange'>&{inputKey:string;pickerLabel:string;onFiles:(files:File[])=>void}){
  const platform=useVideoLingoPlatform(),receive=useRef(onFiles);receive.current=onFiles;
  useLayoutEffect(()=>platform.files?.subscribe(inputKey,!props.disabled,files=>receive.current(files)),[platform,inputKey,props.disabled]);
  if(platform.kind==='android')return <Button type="button" tone="secondary" disabled={props.disabled} aria-label={props['aria-label']} onClick={()=>platform.files!.choose({key:inputKey,accept:props.accept||'',multiple:props.multiple===true,label:pickerLabel})}>{pickerLabel}</Button>;
  return <input {...props} type="file" onChange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';if(files.length)onFiles(files);}}/>;
}
