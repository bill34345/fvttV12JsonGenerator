import { createFoundryAdapter, registerResolverLifecycle } from './foundry-adapter';
import { createFoundryResolverHookController, registerResolverHooks } from './hooks';

export * from './cast-activity';
export * from './hydrator';
export * from './ownership';
export * from './transaction';
export * from './hooks';
export * from './review-app';
export * from './status';
export * from './settings-app';

const resolverAdapter = createFoundryAdapter();
registerResolverLifecycle(resolverAdapter);
registerResolverHooks(Hooks as unknown as import('./hooks').ResolverHookBus, createFoundryResolverHookController());
