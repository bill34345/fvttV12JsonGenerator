import {sha256} from '@fvtt-json-generator/contracts/hash';

export type FailureReplyReason = 'deadline_exceeded'|'user_cancelled'|'connection_failed'|'response_interrupted'|
  'provider_incomplete'|'invalid_json'|'invalid_encoding'|'empty_response'|'unexpected_response'|'provider_error'|'http_error';
export type FailureEvidenceStatus = 'not_configured'|'saved'|'metadata_only'|'save_failed';
export interface TransportFailureDiagnostic {
  version:1;
  reason:FailureReplyReason;
  phase:'awaiting_response_headers'|'reading_response_body';
  elapsedMs:number;
  responseHeadersAtMs?:number;
  firstDataAtMs?:number;
  lastDataAtMs?:number;
  bodyCompletedAtMs?:number;
  httpStatus?:number;
  receivedBytes:number;
  capturedBytes:number;
  bodyComplete:boolean;
  captureTruncated:boolean;
  representation:'utf8'|'escaped-bytes'|'reconstructed-json'|'unavailable';
  providerCode?:string;
  providerType?:string;
  bodyReadFailure?:'interrupted'|'invalid_json'|'invalid_encoding'|'empty_response';
  evidenceStatus:FailureEvidenceStatus;
  hashScope:'complete-response-bytes'|'received-prefix-bytes'|'captured-head-and-tail-bytes'|'reconstructed-json-bytes'|'unavailable';
}
/** Private evidence callback only. Never attach content to an Error or an activity report. */
export interface TransportFailureEvidence {
  diagnostic:Omit<TransportFailureDiagnostic,'evidenceStatus'>;
  content:string;
  capturedBodyHash:string;
  redacted:boolean;
}

export const FAILURE_CAPTURE_LIMIT=1_000_000;
const HALF=FAILURE_CAPTURE_LIMIT/2;
/** Bounded first/last bytes. Keeps the final service error after long keep-alive traffic. */
export class FailureReplyBuffer {
  private head:Uint8Array=new Uint8Array(0);
  private tail:Uint8Array=new Uint8Array(0);
  receivedBytes=0;
  reconstructed=false;
  append(chunk:Uint8Array|string):void {
    let bytes=typeof chunk==='string'?new TextEncoder().encode(chunk):chunk;
    this.receivedBytes+=bytes.byteLength;
    if(this.head.length<HALF){const count=Math.min(HALF-this.head.length,bytes.byteLength);
      this.head=join(this.head,bytes.subarray(0,count));bytes=bytes.subarray(count);}
    if(bytes.byteLength)this.tail=bytes.byteLength>=HALF?bytes.slice(-HALF):join(this.tail,bytes).slice(-HALF);
  }
  snapshot():{content:string;capturedBytes:number;truncated:boolean;hash:string;representation:TransportFailureDiagnostic['representation']} {
    const bytes=join(this.head,this.tail),truncated=this.receivedBytes>bytes.byteLength;
    let content:string,representation:TransportFailureDiagnostic['representation']='utf8';
    try {
      const decoder=new TextDecoder('utf-8',{fatal:true});
      content=truncated?decoder.decode(this.head)+'\n[... middle bytes omitted ...]\n'+decoder.decode(this.tail):decoder.decode(bytes);
    }catch {representation='escaped-bytes';content=truncated?escapeBytes(this.head)+'\n[... middle bytes omitted ...]\n'+escapeBytes(this.tail):escapeBytes(bytes);}
    if(this.reconstructed)representation='reconstructed-json';
    return {content,capturedBytes:bytes.length,truncated,hash:sha256(bytes),representation};
  }
}
function join(left:Uint8Array,right:Uint8Array):Uint8Array {const output=new Uint8Array(left.length+right.length);output.set(left);output.set(right,left.length);return output;}
function escapeBytes(bytes:Uint8Array):string {return Array.from(bytes,value=>(value>=32&&value<=126)||[9,10,13].includes(value)?String.fromCharCode(value):'\\x'+value.toString(16).padStart(2,'0')).join('');}

/** Handles valid or broken JSON, including unterminated sensitive strings/objects. */
export function sanitizeFailureReply(content:string,forbidden:readonly string[]):string {
  let safe=content;
  for(const value of forbidden){if(!value)continue;
    for(const form of [value,JSON.stringify(value).slice(1,-1),escapeBytes(new TextEncoder().encode(value))]){
      safe=safe.split(form).join('[redacted]');
      for(let length=form.length-1;length>=4;length--)if(safe.endsWith(form.slice(0,length))){safe=safe.slice(0,-length)+'[redacted-partial]';break;}
    }}
  safe=safe.replace(/\bBearer\s+[^\s"',;}\]]+/giu,'Bearer [redacted]');
  const field=/(?:\\?["'])(?:api[-_]?key|authorization|cookie|password|credential|secret|reasoning(?:_content|_text)?|thinking|delta|messages|systemPrompt|userContent)(?:\\?["'])\s*:\s*/giu;
  let output='',offset=0,match:RegExpExecArray|null;
  while((match=field.exec(safe))){
    const start=field.lastIndex,end=valueEnd(safe,start);
    output+=safe.slice(offset,start)+'"[redacted]"';offset=end;field.lastIndex=end;
  }
  safe=output+safe.slice(offset);
  return safe.replace(/((?:api[-_]?key|authorization|cookie|password|credential|secret)\s*[:=]\s*)[^\r\n,;]+/giu,'$1[redacted]');
}
function valueEnd(text:string,start:number):number {
  const first=text[start];
  if(first==='"'||first==="'"){
    for(let index=start+1;index<text.length;index++){if(text[index]==='\\'){index++;continue;}if(text[index]===first)return index+1;}return text.length;
  }
  if(first==='{'||first==='['){
    let depth=0,quote='';for(let index=start;index<text.length;index++){
      const char=text[index]!;if(quote){if(char==='\\')index++;else if(char===quote)quote='';continue;}
      if(char==='"'||char==="'"){quote=char;continue;}if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){depth--;if(!depth)return index+1;}
    }return text.length;
  }
  const end=text.slice(start).search(/[,}\]\r\n]/u);return end<0?text.length:start+end;
}
