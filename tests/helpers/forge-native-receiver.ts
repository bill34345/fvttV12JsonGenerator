import {readFileSync} from 'node:fs';
import type {JsonObject} from '@fvtt-json-generator/forge-gateway-protocol';

interface NativeReceiverCase{
  key:'sentinel'|'target'|'shield';kind:'Actor'|'Item';constructor:string;source:string;
  inputHash:string;outputHash:string;input:JsonObject;output:JsonObject;
}

/** Exact task-owned, unpersisted constructor capture; no baseline or other world Documents. */
export const NATIVE_RECEIVER_CAPTURE=JSON.parse(readFileSync(new URL('../fixtures/forge-native6-receiver/capture.json',import.meta.url),'utf8')) as {
  schema:string;
  provenance:{core:string;systemId:'dnd5e';systemVersion:string;productIndexSha256:string};
  cases:NativeReceiverCase[];
};
