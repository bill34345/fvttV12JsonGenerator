/** Read-only comparison of the exact committed model in this test process.
 * No checkout overwrite, fixture rewrite, copied checkout or acceptance waiver. */
import {plugin} from 'bun';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const baselinePaths=['packages/models/src/sourceOperations.ts','packages/intake-ai/src/staged-feature-mechanics.ts'];
const baseline=new Map(baselinePaths.map(path=>[resolve(path),execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'})]));
console.error('Read-only baseline modules: '+baselinePaths.map(path=>'HEAD:'+path).join(', '));
plugin({name:'forge-task-head-model',setup(build){
  build.onLoad({filter:/(?:sourceOperations|staged-feature-mechanics)\.ts$/u},args=>{
    const contents=baseline.get(resolve(args.path));return contents===undefined?undefined:{contents,loader:'ts'};
  });
}});
