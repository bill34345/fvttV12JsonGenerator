import {test,expect} from 'bun:test';
import {adaptLocalCodexResponses} from '../tools/forge-encounter/localCodexResponses';
import {requestIntakeProvider} from '@fvtt-json-generator/intake-ai/transport';
const created={type:'response.created',sequence_number:0,response:{id:'r1',status:'in_progress',output:[]}};
const item={type:'response.output_item.done',sequence_number:1,output_index:0,item:{id:'m1',type:'message',role:'assistant',status:'completed',channel:'final',content:[{type:'output_text',text:'{"ok":true}'}]}};
const completed={type:'response.completed',sequence_number:2,response:{id:'r1',model:'fixture',status:'completed',output:[]}};
function stream(events:unknown[]){const text=events.map(e=>`data: ${typeof e==='string'?e:JSON.stringify(e)}\n\n`).join('');const bytes=new TextEncoder().encode(text);return new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});}
async function consume(events:unknown[]){return requestIntakeProvider({baseUrl:'https://fixture.invalid/v1',apiKey:'fixture',model:'fixture',protocol:'openai-responses',stream:true,systemPrompt:'fixture',userContent:'fixture',structuredOutput:{mode:'json_object'},httpClient:async()=>new Response(adaptLocalCodexResponses(stream(events)),{status:200,headers:{'Content-Type':'text/event-stream'}})});}
test('local proxy materializes only completed assistant items and strips its trailing terminator',async()=>{
  const result=await consume([created,item,completed,'[DONE]']);expect(JSON.parse(result.content)).toEqual({ok:true});
});
test('a partial delta cannot replace a missing completed output item',async()=>{
  await expect(consume([created,{type:'response.output_text.delta',sequence_number:1,delta:'{"ok":true}'},completed,'[DONE]'])).rejects.toThrow();
});
test('foreign identity, duplicate items, premature terminators and data after terminal remain rejected',async()=>{
  for(const events of [[created,item,{...completed,response:{...completed.response,id:'r2'}},'[DONE]'],[created,item,{...item,sequence_number:2},{...completed,sequence_number:3},'[DONE]'],[created,'[DONE]',item,completed],[created,item,completed,'[DONE]','[DONE]'],[created,item,completed,{type:'unexpected',sequence_number:3}]]){
    await expect(consume(events)).rejects.toThrow();
  }
});
test('completed items cannot borrow another response or duplicate one identity at different indices',async()=>{
  const noId={...completed,response:{model:'fixture',status:'completed',output:[]}};
  for(const events of [[created,{...item,response_id:'r2'},completed,'[DONE]'],[created,item,noId,'[DONE]'],[created,item,{...item,sequence_number:2,output_index:1},{...completed,sequence_number:3},'[DONE]'],[created,{...item,item:{...item.item,id:''}},completed,'[DONE]']]){
    await expect(consume(events)).rejects.toThrow();
  }
});
