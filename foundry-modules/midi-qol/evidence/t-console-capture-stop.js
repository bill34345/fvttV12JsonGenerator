if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||!game.user.isGM)throw new Error('Wrong test target');
const capture=globalThis.__midiAcceptanceCapture;
if(!capture)throw new Error('No capture exists in this client; do not invent a log');
const report=capture.stop();
// All objects in report were created by the capture, never copied from console
// arguments. Sanitize strings before any persistence and restrict delivery to self.
const sanitize=value=>{
  if(typeof value==='string')return value
    .replace(/(?:https?|wss?):\/\/[^\s"'<>]+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';u.search='';u.hash='';return u.toString();}catch{return '[URL omitted]';}})
    .replace(/data:[^\s]+/gi,'[inline data omitted]')
    .replace(/(?:password|passwd|secret|token|authorization|cookie|api[-_ ]?key)[^\n]*/gi,'[sensitive text redacted]');
  if(Array.isArray(value))return value.map(sanitize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v)]));
  return value;
};
const safe=JSON.stringify(sanitize(report),null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await ChatMessage.create({content:`<pre>${safe}</pre>`,whisper:[game.user.id]});
// On publication failure the stopped report remains recoverable by rerunning Stop.
if(globalThis.__midiAcceptanceCapture===capture)delete globalThis.__midiAcceptanceCapture;
