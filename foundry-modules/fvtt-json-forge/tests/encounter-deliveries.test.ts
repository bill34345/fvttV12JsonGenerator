import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { renderEncounterDeliveries } from '../src/encounterDeliveries';

test('individual results retain available downloads, pending members, warnings and escaped source', () => {
  const html = renderEncounterDeliveries([
    {key:'first', label:'守卫 Guard', status:'已生成', available:true, findings:['请核对豁免'], source:'<script>source()</script>'},
    {key:'second', label:'<img src=x onerror=alert(1)>', status:'未完成', available:false, findings:['原文不完整']},
  ], {busy:false, generating:false, canResume:true});
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    expect(document.querySelector('header p')?.textContent).toBe('已生成 1 / 2 · 2 项待核对');
    expect(document.querySelectorAll('[data-actor-delivery]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-actor-candidate-download]')).toHaveLength(1);
    expect(document.querySelector('[data-action="encounter-resume"]')).not.toBeNull();
    expect(document.querySelector('[data-action="encounter-resume"]')?.textContent).toContain('继续生成 1 只生物');
    expect(document.querySelector('.forge-delivery-primary-finding')?.textContent).toBe('请核对豁免');
    expect(document.querySelector('.forge-delivery-primary-finding')?.closest('details')).toBeNull();
    expect(document.querySelector('pre')?.textContent).toBe('<script>source()</script>');
    expect(document.querySelectorAll('script, img')).toHaveLength(0);
    expect(document.querySelector('[data-actor-delivery="second"]')?.textContent).toContain('未完成');
  } finally { dom.window.close(); }
});

test('retained complete candidates keep export and clarify the remaining import preparation', () => {
  const dom = new JSDOM(renderEncounterDeliveries([
    {key:'one', label:'守卫 Guard', status:'已生成', available:true, findings:['检查动作', '检查豁免']},
  ], {busy:false, generating:false, canResume:true}));
  try {
    const document = dom.window.document;
    expect(document.querySelector('[data-action="encounter-resume"]')?.textContent).toContain('继续准备导入');
    expect(document.querySelector<HTMLButtonElement>('[data-actor-candidate-download]')?.disabled).toBe(false);
    expect(document.querySelector('.forge-delivery-primary-finding')?.textContent).toBe('检查动作');
    expect(document.querySelector('.forge-delivery-notes details li')?.textContent).toBe('检查豁免');
  } finally { dom.window.close(); }
});

test('running results expose stop and disable downloads while preserving their content', () => {
  const dom = new JSDOM(renderEncounterDeliveries([
    {key:'one', label:'守卫 Guard', status:'已生成', available:true, findings:[]},
  ], {busy:true, generating:true, canResume:false}));
  try {
    expect(dom.window.document.querySelector<HTMLButtonElement>('[data-actor-candidate-download]')?.disabled).toBe(true);
    expect(dom.window.document.querySelector('[data-action="encounter-ai-stop"]')).not.toBeNull();
    expect(dom.window.document.querySelector('[data-action="encounter-resume"]')).toBeNull();
  } finally { dom.window.close(); }
});
