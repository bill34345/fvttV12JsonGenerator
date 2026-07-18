import { createFoundryAdapter, registerResolverLifecycle } from './foundry-adapter';

registerResolverLifecycle(createFoundryAdapter());
