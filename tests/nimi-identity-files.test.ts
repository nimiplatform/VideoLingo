import test from 'node:test';
import assert from 'node:assert/strict';
import {IdentityFiles,type FileBinding} from '../src-web/identity-files.ts';
const intent={key:'project-media/one',accept:'.mp4',multiple:false,label:'Choose media'};
function binding(targetRef:string,viewKey:string,signal:AbortSignal,sent:unknown[]):FileBinding{return {targetRef,viewKey,signal,send:value=>sent.push(value)};}
test('retains an actual File across Runtime scope loss and sends it only after explicit continuation to a fresh ready input',()=>{
  const identity=new AbortController(),old=new AbortController(),next=new AbortController(),sent:unknown[]=[];
  let picked=0;const files=new IdentityFiles(identity.signal,()=>picked++);
  files.setBinding(binding('pc-one','old',old.signal,sent));files.inputReady(intent.key,true,'old');
  files.choose(intent,'pc-one','old',{'batch-items':[{projectId:'kept-project'}]});assert.equal(picked,1);
  old.abort();const file=new File(['real selected content'],'clip.mp4',{type:'video/mp4'});files.selected([file]);
  assert.equal(files.getSnapshot()?.files[0],file);assert.equal(files.canDeliver(),false);assert.equal(sent.length,0);
  files.setBinding(binding('pc-one','new',next.signal,sent));assert.equal(files.canDeliver(),false);files.inputReady(intent.key,true,'new');
  assert.equal(sent.length,0);files.deliver();assert.equal(sent.length,1);
  const delivered=sent[0] as {files:File[];id:string};assert.equal(delivered.files[0],file);
  assert.deepEqual(files.snapshot('pc-one')['batch-items'],[{projectId:'kept-project'}]);
  files.acknowledged(delivered.id,'new');assert.equal(files.getSnapshot(),undefined);identity.abort();
});
test('never redirects a selected file to another PC or lets an old document acknowledge a new delivery',()=>{
  const identity=new AbortController(),first=new AbortController(),next=new AbortController(),sent:unknown[]=[];
  const files=new IdentityFiles(identity.signal,()=>{});files.setBinding(binding('pc-one','old',first.signal,sent));files.choose(intent,'pc-one','old',{});files.selected([new File(['x'],'clip.mp4')]);first.abort();
  files.setBinding(binding('pc-two','new',next.signal,sent));files.inputReady(intent.key,true,'new');assert.equal(files.canDeliver(),false);assert.throws(()=>files.deliver(),/original PC/);assert.equal(sent.length,0);
  files.acknowledged(files.getSnapshot()!.id,'old');assert.ok(files.getSnapshot());identity.abort();
});
test('identity loss clears files and drafts; reconnecting Runtime never replays an uncertain upload',()=>{
  const identity=new AbortController(),scope=new AbortController(),next=new AbortController(),sent:unknown[]=[];
  const files=new IdentityFiles(identity.signal,()=>{});files.setBinding(binding('pc','one',scope.signal,sent));files.inputReady(intent.key,true,'one');files.choose(intent,'pc','one',{'voice-input':'original draft'});files.selected([new File(['x'],'clip.mp4')]);files.deliver();scope.abort();
  files.setBinding(binding('pc','two',next.signal,sent));files.inputReady(intent.key,true,'two');assert.equal(files.getSnapshot()?.state,'unconfirmed');assert.equal(files.canDeliver(),false);assert.equal(sent.length,1);
  identity.abort();assert.equal(files.getSnapshot(),undefined);assert.deepEqual(files.snapshot('pc'),{});
});
