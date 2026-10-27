import { describe, expect, test } from 'bun:test';
import { mountForgeDirectoryButton, openForgeConnectionSettings,openForgeWorkspace } from '../src/index';

function directory() {
  const buttons: any[] = [];
  const document = { createElement: (tag: string) => ({ tag, dataset: {}, children: [] as any[], setAttribute() {}, append(...nodes: any[]) { this.children.push(...nodes); }, remove() { const i = buttons.indexOf(this); if (i >= 0) buttons.splice(i, 1); } }) };
  const host = { append: (button: any) => buttons.push(button) };
  return { buttons, root: { ownerDocument: document, querySelector: (selector: string) => selector === '[data-forge-directory-entry]' ? buttons[0] : selector === '.header-actions' ? host : null } };
}
function environment(isGM = true, version = '14.364') { return { game: { user: { isGM }, version, system: { id: 'dnd5e', version: '5.3.3' } } }; }

describe('Forge directory entry', () => {
  test('adds one Actor entry across repeated renders without replacing native header contents', () => {
    const { root, buttons } = directory();
    mountForgeDirectoryButton('Actor', root, environment());
    mountForgeDirectoryButton('Actor', root, environment());
    expect(buttons).toHaveLength(1);
    expect(buttons[0].dataset.forgeDirectoryEntry).toBe('Actor');
    expect(buttons[0].children[1].textContent).toBe('Forge 生物');
  });
  test('routes Item directories separately and supports legacy wrapped roots', () => {
    const { root, buttons } = directory();
    mountForgeDirectoryButton('Item', [root], environment());
    expect(buttons[0].dataset.forgeDirectoryEntry).toBe('Item');
    expect(buttons[0].children[1].textContent).toBe('Forge 物品');
  });
  test('does not expose Item GM controls to players or unsupported runtime and removes a stale entry', () => {
    const { root, buttons } = directory();
    mountForgeDirectoryButton('Item', root, environment(false));
    mountForgeDirectoryButton('Item', root, environment(true, '14.365'));
    expect(buttons).toHaveLength(0);
    mountForgeDirectoryButton('Item', root, environment());
    mountForgeDirectoryButton('Item', root, environment(false));
    expect(buttons).toHaveLength(0);
  });
  test('actor read access: Actor entry can open local saved output outside the write runtime or GM role',()=>{
    const{root,buttons}=directory();mountForgeDirectoryButton('Actor',root,environment(false,'14.999'));
    expect(buttons).toHaveLength(1);expect(buttons[0].dataset.forgeDirectoryEntry).toBe('Actor');
    class Application{rendered=false;render(){this.rendered=true;return this;}async close(){}}
    const env={...environment(false,'14.999'),game:{...environment(false,'14.999').game,user:{id:'owner',isGM:false},world:{id:'saved-output-world'}},
      foundry:{applications:{api:{ApplicationV2:Application,HandlebarsApplicationMixin:(Base:any)=>class extends Base{}}}}};
    expect(()=>openForgeWorkspace('Actor',env,'ai')).not.toThrow();
    expect(()=>openForgeWorkspace('Item',env,'ai')).toThrow('GM');
  });
});


test('reuses an opening settings window during rapid double activation', async () => {
  let count = 0;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  class Application { rendered = false; constructor() { count += 1; } render() { return pending.then(() => { this.rendered = true; return this; }); } }
  const env = { ...environment(), foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (Base: any) => class extends Base {} } } } };
  const first = openForgeConnectionSettings(env);
  openForgeConnectionSettings(env);
  expect(count).toBe(1);
  finish(); await first;
  openForgeConnectionSettings(env);
  expect(count).toBe(1);
});
