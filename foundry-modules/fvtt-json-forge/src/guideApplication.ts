import { parse, serialize, serializeOuter, type DefaultTreeAdapterTypes } from 'parse5';
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
        const response=await (environment.fetch??globalThis.fetch.bind(globalThis))(FORGE_GUIDE_URL,{cache:'no-cache'});
        if(!response.ok)throw new Error('Guide read failed.');
        return {...downloads,...readGuideDocument(await response.text(),directory)};
      }catch{
        return {...downloads,guideError:'无法读取内置手册。请检查模块文件；也可以先下载 PDF 查看。'};
      }
    }

    _onRender() {
      const root=this.element as HTMLElement|undefined;
      if(!root)return;
      for(const link of root.querySelectorAll<HTMLAnchorElement>('.forge-guide-document nav a[href^="#"]')) {
        link.onclick=event=>{
          event.preventDefault();
          event.stopPropagation();
          root.querySelector<HTMLElement>(link.getAttribute('href')!)?.scrollIntoView({block:'start'});
        };
      }
      // Core 14 promotes document-level links to new tabs, including downloads.
      for(const link of root.querySelectorAll<HTMLAnchorElement>('a[download]'))link.onclick=event=>event.stopPropagation();
    }
  };
}

function readGuideDocument(source:string,directory:string):{guideStyles:string;guideContent:string} {
  const elements=guideElements(parse(source));
  const styles=elements.find(element=>element.tagName==='style'&&element.attrs.some(attribute=>attribute.name==='id'&&attribute.value==='forge-guide-styles'));
  const content=elements.find(element=>element.attrs.some(attribute=>attribute.name==='id'&&attribute.value==='forge-guide-content'));
  if(!styles||!content)throw new Error('Guide document is incomplete.');
  for(const element of guideElements(content)) {
    for(const attribute of element.attrs) {
      if((attribute.name==='href'||attribute.name==='src')&&!attribute.value.startsWith('#'))attribute.value=`${directory}${attribute.value}`;
    }
  }
  return {guideStyles:serialize(styles),guideContent:serializeOuter(content)};
}

function guideElements(node:DefaultTreeAdapterTypes.Node):DefaultTreeAdapterTypes.Element[] {
  const elements:DefaultTreeAdapterTypes.Element[]='tagName' in node?[node]:[];
  if('childNodes' in node)for(const child of node.childNodes)elements.push(...guideElements(child));
  return elements;
}
