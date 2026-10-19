import type { ForgeActorResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import type { RulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';

// Local generation proof, deliberately outside the closed Forge wire protocol.
// Serialization or a caller-supplied response can never manufacture this context.
const contexts = new WeakMap<ForgeActorResponse, RulePresentationPlan>();
export function withActorRulePresentation<T extends ForgeActorResponse>(response: T, plan?: RulePresentationPlan): T {
  if (plan) contexts.set(response, plan);
  return response;
}
export function actorRulePresentation(response: ForgeActorResponse): RulePresentationPlan | undefined {
  return contexts.get(response);
}
