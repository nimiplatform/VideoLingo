import {registerPlugin} from '@capacitor/core';
const files=registerPlugin<{
  beginExport(input:{name:string;mimeType:string;size:number}):Promise<{id:string}>;
  appendExport(input:{id:string;offset:number;data:string}):Promise<{received:number}>;
  saveExport(input:{id:string}):Promise<{bytesWritten:number;name:string}>;
  abortExport(input:{id:string}):Promise<void>;
}>('VideoLingoFiles');
export async function saveAndroidFile(body:AsyncIterable<Uint8Array>,name:string,mimeType:string,size:number,signal:AbortSignal){
  signal.throwIfAborted();const {id}=await files.beginExport({name,mimeType,size});let offset=0,choosing=false;
  try{for await(const part of body)for(let position=0;position<part.length;position+=65536){signal.throwIfAborted();const bytes=part.subarray(position,position+65536);let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));const result=await files.appendExport({id,offset,data:btoa(value)});offset+=bytes.length;if(result.received!==offset)throw new Error('Android did not receive the complete file range');}signal.throwIfAborted();if(offset!==size)throw new Error('The PC export ended before all bytes arrived');
    // System Save may background the App and end its Runtime scope. All authorized bytes are already local;
    // the explicit local save owns completion and does not reconnect or replay any PC operation.
    choosing=true;const result=await files.saveExport({id});if(result.bytesWritten!==size)throw new Error('The selected file was not completely saved');return {canceled:false,bytes:result.bytesWritten};
  }catch(error){if(!choosing)await files.abortExport({id}).catch(()=>{});if((error as {code?:string}).code==='VIDEOLINGO_EXPORT_CANCELED')return {canceled:true};throw error;}
}
