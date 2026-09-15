/** Adapt the audited local Codex WebSocket proxy, without weakening the shared Responses parser. */
export function adaptLocalCodexResponses(body:ReadableStream<Uint8Array>,observe:(metadata:Record<string,unknown>)=>void=()=>{}):ReadableStream<Uint8Array>{
  const decoder=new TextDecoder(),encoder=new TextEncoder();
  let buffer='',terminal=false,removed=false,responseId:string|undefined;
  let bytes=0,lastLog=Date.now(),lastType='',lastItemType='';
  const completedMessages=new Map<number,Record<string,any>>();
  const completedItemIds=new Set<string>();
  function block(frame:string):string{
    const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if(data==='[DONE]'&&terminal&&!removed){removed=true;observe({event:'proxy-terminator-removed'});return '';}
    if(!data||data==='[DONE]')return frame;
    let event:Record<string,any>;try{event=JSON.parse(data);}catch{return frame;}
    lastType=String(event.type??'');if(event.item?.type)lastItemType=String(event.item.type);
    if(terminal)return frame; // The shared parser rejects any native data after a terminal.
    if(event.response?.id!==undefined){
      if(typeof event.response.id!=='string'||!event.response.id.trim())throw new Error('Local response identity is invalid.');
      if(responseId&&responseId!==event.response.id)throw new Error('Local response identity changed within its stream.');
      responseId=event.response.id;
    }
    if(event.response_id!==undefined&&event.response_id!==responseId)throw new Error('Local item belongs to a different response.');
    if(lastType==='response.output_item.done'&&event.item?.type==='message'&&event.item.role==='assistant'&&event.item.status==='completed'
      &&(!event.item.channel||event.item.channel==='final')){
      if(!responseId||!Number.isInteger(event.output_index)||event.output_index<0||typeof event.item.id!=='string'||!event.item.id.trim()
        ||completedMessages.has(event.output_index)||completedItemIds.has(event.item.id))throw new Error('Local completed item identity is missing or duplicated.');
      if(!Array.isArray(event.item.content)||!event.item.content.length||!event.item.content.every((c:any)=>c.type==='output_text'&&typeof c.text==='string'))throw new Error('Local completed assistant item has unsupported content.');
      completedMessages.set(event.output_index,event.item);
      completedItemIds.add(event.item.id);
    }
    if(['response.completed','response.failed','response.incomplete'].includes(lastType)){
      terminal=true;observe({event:lastType,status:event.response?.status,errorCode:event.response?.error?.code});
      if(lastType==='response.completed'&&event.response?.status==='completed'&&Array.isArray(event.response.output)
        &&event.response.output.length===0&&completedMessages.size){
        if(typeof event.response.id!=='string'||!event.response.id||event.response.id!==responseId)throw new Error('Local terminal response identity is missing.');
        event.response.output=[...completedMessages.entries()].sort(([a],[b])=>a-b).map(([,item])=>item);
        observe({event:'completed-output-materialized',items:completedMessages.size});
        return `data: ${JSON.stringify(event)}\n\n`;
      }
    }
    return frame;
  }
  return body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){
      bytes+=chunk.length;if(bytes>32*1024*1024)throw new Error('Local response stream exceeded its byte limit.');
      buffer+=decoder.decode(chunk,{stream:true});let match:RegExpExecArray|null;
      while((match=/\r?\n\r?\n/.exec(buffer))){const end=match.index+match[0].length;const frame=buffer.slice(0,end);buffer=buffer.slice(end);
        const output=block(frame);if(output)controller.enqueue(encoder.encode(output));}
      if(Date.now()-lastLog>15000){observe({streamBytes:bytes,lastType,lastItemType});lastLog=Date.now();}
    },
    flush(controller){buffer+=decoder.decode();if(buffer){const output=block(buffer);if(output)controller.enqueue(encoder.encode(output));}observe({streamComplete:true,bytes,terminal,removed});},
  }));
}
