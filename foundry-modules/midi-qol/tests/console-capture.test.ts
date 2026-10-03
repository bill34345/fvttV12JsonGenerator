import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const code=readFileSync(resolve(import.meta.dir,'../evidence/t-console-capture-start.js'),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const start=new AsyncFunction('globalThis','console','window','location','game','ChatMessage','PerformanceObserver',code);
const stop=new AsyncFunction('globalThis','location','game','ChatMessage',readFileSync(resolve(import.meta.dir,'../evidence/t-console-capture-stop.js'),'utf8'));
test('test Console capture forwards original calls, never suppresses browser errors, and restores exact functions',async()=>{
  const state:any={}, calls:any[]=[], messages:any[]=[];
  const originalError=function(this:any,...args:any[]){calls.push({self:this,args});return 41;};
  const originalWarn=function(...args:any[]){calls.push({args});};
  const fakeConsole={error:originalError,warn:originalWarn};
  const events=new EventTarget();
  await start(state,fakeConsole,events,{origin:'http://127.0.0.1:30002'},
    {world:{id:'cor-cotn'},user:{isGM:true}},{create:async(data:any)=>messages.push(data)},undefined);
  expect(fakeConsole.error('test error',new Error('test diagnostic'))).toBe(41);
  expect(calls[0].self).toBe(fakeConsole);
  const event=new Event('error',{cancelable:true});events.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  const report=state.__midiAcceptanceCapture.stop();
  expect(report.records.map((r:any)=>r.kind)).toEqual(['console.error','window.error']);
  expect(report.records[0].args[1]).toEqual({type:'object',omitted:true});
  expect(report.conflicts).toEqual([]);
  expect(fakeConsole.error).toBe(originalError);
  expect(fakeConsole.warn).toBe(originalWarn);
  expect(state.__midiAcceptanceCapture.stop()).toBe(report);
  const count=report.records.length;events.dispatchEvent(new Event('error'));
  expect(report.records).toHaveLength(count);
});
test('unknown Console arguments cannot run getters or coercion before forwarding',async()=>{
  const state:any={}, fakeConsole={error:(...args:any[])=>args,warn:()=>{}};
  let touched=0;
  const suspicious={get constructor(){touched++;throw new Error('getter');},get message(){touched++;return 'secret';},toString(){touched++;return 'coercion';}};
  await start(state,fakeConsole,new EventTarget(),{origin:'http://127.0.0.1:30002'},
    {world:{id:'cor-cotn'},user:{id:'gm',isGM:true}},{create:async()=>{}},undefined);
  const args=fakeConsole.error(suspicious);
  expect(args[0]).toBe(suspicious);expect(touched).toBe(0);
  expect(state.__midiAcceptanceCapture.stop().records[0].args).toEqual([{type:'object',omitted:true}]);
});
test('failed private report delivery retains evidence and retry redacts credentials with self-only recipients',async()=>{
  const state:any={}, error=(..._args:unknown[])=>{}, fakeConsole={error,warn:()=>{}};
  const location={origin:'http://127.0.0.1:30002'},game={world:{id:'cor-cotn'},user:{id:'gm',isGM:true}};
  await start(state,fakeConsole,new EventTarget(),location,game,{create:async()=>{}},undefined);
  fakeConsole.error('https://user:pass@example.test/route?key=abcdef token=secretvalue');
  await expect(stop(state,location,game,{create:async()=>{throw new Error('Delivery failed');}})).rejects.toThrow('Delivery failed');
  expect(fakeConsole.error).toBe(error);
  expect(state.__midiAcceptanceCapture.stop().records).toHaveLength(1);
  let sent:any;
  await stop(state,location,game,{create:async(data:any)=>{sent=data;}});
  expect(sent.whisper).toEqual(['gm']);expect(sent.content).not.toContain('abcdef');
  expect(sent.content).not.toContain('secretvalue');expect(sent.content).not.toContain('user:pass');
  expect(state.__midiAcceptanceCapture).toBeUndefined();
});
test('capture startup failure restores methods; stop preserves someone else’s intervening Console change',async()=>{
  const state:any={}, first=()=>{}, later=()=>{}, fakeConsole={error:first,warn:first};
  const args=[state,fakeConsole,new EventTarget(),{origin:'http://127.0.0.1:30002'},
    {world:{id:'cor-cotn'},user:{isGM:true}}];
  await expect(start(...args,{create:async()=>{throw new Error('No chat');}},undefined)).rejects.toThrow('No chat');
  expect(fakeConsole.error).toBe(first);
  expect(state.__midiAcceptanceCapture).toBeUndefined();
  await start(...args,{create:async()=>{}},undefined);
  fakeConsole.error=later;
  expect(state.__midiAcceptanceCapture.stop().conflicts).toEqual(['error']);
  expect(fakeConsole.error).toBe(later);
});
