/** Replaced by the bundler only for an explicit module build. */
declare const __WMP_BUILD_ID__: string;
export const WEAPON_BUILD_ID: string = typeof __WMP_BUILD_ID__ === 'undefined' ? 'source-unbuilt' : __WMP_BUILD_ID__;
