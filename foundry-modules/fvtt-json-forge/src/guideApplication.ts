import { assertExactRuntime, assertGm } from './runtime';

export const FORGE_GUIDE_URL = 'modules/fvtt-json-forge/guide/index.html';

/** A bundled read-only guide; opening it never changes the working source or world documents. */
export function createForgeGuideApplicationClass(environment: { game: any; foundry?: any; fetch?: (url: string, options: RequestInit) => Promise<Response> }): any {
  const api = (environment.foundry ?? (globalThis as any).foundry)?.applications?.api;
  if (!api?.ApplicationV2 || typeof api.HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 is required to view the Forge guide.');
  }
  const Base = api.HandlebarsApplicationMixin(api.ApplicationV2);
  return class ForgeGuideApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-guide', classes: ['fvtt-json-forge', 'forge-guide-window'],
      position: { width: 1180, height: 860 },
      window: { title: 'Forge · 图解手册', resizable: true },
    };
    static PARTS = { guide: { template: 'modules/fvtt-json-forge/templates/forge-guide.hbs' } };

    async _prepareContext() {
      assertGm(environment.game); assertExactRuntime(environment.game);
      const directory=FORGE_GUIDE_URL.slice(0,FORGE_GUIDE_URL.lastIndexOf('/')+1);
      const downloads={guidePdfUrl:`${directory}guide.pdf`,guideSourceUrl:`${directory}source-example.md`,guidePackageUrl:`${directory}grandmother-sea-hag.forge-encounter.zip`};
      try{
        // Foundry serves module HTML as text/plain. Render our bundled document in
        // srcdoc, retaining the script-disabled sandbox and its local download base.
        const response=await (environment.fetch??globalThis.fetch.bind(globalThis))(FORGE_GUIDE_URL,{cache:'no-cache'});
        if(!response.ok)throw new Error('Guide read failed.');
        const source=await response.text();
        if(!/<head(?:\s|>)/iu.test(source))throw new Error('Guide document is incomplete.');
        return {...downloads,guideHtml:source.replace(/<head(?:\s[^>]*)?>/iu,head=>`${head}<base href="${directory}">`)};
      }catch{
        return {...downloads,guideError:'无法读取内置手册。请检查模块文件；也可以先下载 PDF 查看。'};
      }
    }
  };
}
