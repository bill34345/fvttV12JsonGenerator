// Test-only, pass-through capture for this client. No workflow/document/prototype
// modification, no error suppression, no historical DevTools-log claim.
if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||!game.user.isGM)throw new Error('Wrong test target');
if(globalThis.__midiAcceptanceCapture)throw new Error('An existing capture must be stopped before starting another');
const key='__midiAcceptanceCapture', records=[], resources=[], original={}, wrapped={};
let dropped=0, resourceDropped=0, observer=null, completed=null;
const startedAt=new Date().toISOString();
const text=value=>{
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'||value==null)return value;
  // Never inspect unknown objects, invoke getters, or coerce user values before
  // forwarding the original call. Error-object details may remain in Troubleshooter.
  return {type:typeof value,omitted:true};
};
const record=(kind,args)=>{
  if(records.length>=2000){dropped++;return;}
  records.push({at:new Date().toISOString(),kind,args:args.map(text)});
};
for(const level of ['error','warn']){
  original[level]=console[level];
  wrapped[level]=function(...args){
    try{record(`console.${level}`,args);}catch{/* Capture failure must not change normal logging. */}
    return Reflect.apply(original[level],this,args);
  };
  console[level]=wrapped[level];
}
const onError=event=>{try{record('window.error',[event.error??event.message??'resource error',event.filename??event.target?.src??null]);}catch{}};
const onRejection=event=>{try{record('unhandledrejection',[event.reason]);}catch{}};
window.addEventListener('error',onError,true);
window.addEventListener('unhandledrejection',onRejection);
let resourceCapability='not available';
if(typeof PerformanceObserver==='function'){
  try{
    observer=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(resources.length>=2000){resourceDropped++;continue;}
        let url;try{const parsed=new URL(entry.name);url=/^https?:$/.test(parsed.protocol)?parsed.origin+parsed.pathname:'non-http resource omitted';}catch{url='unparseable';}
        resources.push({url,status:typeof entry.responseStatus==='number'?entry.responseStatus:null,
          initiator:entry.initiatorType,startTime:entry.startTime,duration:entry.duration});
      }
    });
    observer.observe({type:'resource',buffered:false});
    resourceCapability='PerformanceObserver resource entries; null/0 status is unknown, not success or failure';
  }catch(error){resourceCapability=String(error.message);observer?.disconnect();observer=null;}
}
globalThis[key]={
  stop(){
    if(completed)return completed;
    const conflicts=[];
    for(const level of ['error','warn']){
      if(console[level]===wrapped[level])console[level]=original[level];else conflicts.push(level);
    }
    window.removeEventListener('error',onError,true);
    window.removeEventListener('unhandledrejection',onRejection);
    observer?.disconnect();
    completed={startedAt,endedAt:new Date().toISOString(),records,resources,dropped,resourceDropped,conflicts,
      source:'Pass-through Console calls plus browser error/rejection events and resource timing, after capture start only',
      limitations:['Not historical DevTools logs','Object arguments omitted without inspecting getters or coercion','Console aliases bound before capture may not be intercepted','Resource timing is not a complete network trace'],resourceCapability};
    return completed;
  }
};
try {
  await ChatMessage.create({content:`<p>Midi acceptance capture started: ${startedAt}. Normal Console behavior is preserved.</p>`,whisper:[game.user.id]});
} catch(error) {globalThis[key].stop();delete globalThis[key];throw error;}
