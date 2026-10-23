import type {ForgeActorResponse} from '@fvtt-json-generator/forge-gateway-protocol';
import type {ParsedNPC} from '@fvtt-json-generator/parser/mapping';

// Source review belongs to the local Forge session, never the portable Actor.
const reviews=new WeakMap<object,readonly string[]>();
export function withActorSourceReviews<T extends ForgeActorResponse>(response:T,parsed:ParsedNPC):T{
  const entries=[{name:parsed.name,review:parsed.candidateReview},...Object.values(parsed.structuredActions??{}).flatMap(actions=>
    actions?.map(action=>({name:action.name,review:action.candidateReview}))??[])];
  const findings=[...new Set(entries.flatMap(({name,review})=>review?.findings.map(f=>`${name}：${f.message}（${f.code}；${f.path}）`)??[]))];
  reviews.set(response,Object.freeze(findings));return response;
}
export function actorSourceReviews(response:ForgeActorResponse):readonly string[]{return reviews.get(response)??[];}
