import { createHash } from 'node:crypto';

// Hash the original source spans, including private-field references. Do not
// evaluate a getter or rebuild it as an unrelated function to obtain its identity.
export function workflowFingerprints(bundle: string, ts: any) {
  const ast = ts.createSourceFile('midi-qol.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const classes: any[] = [];
  const damageClasses: any[] = [];
  const effectClasses: any[] = [];
  const visit = (node: any) => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node))
      && /^_?MidiActiveEffect\d*$/u.test(node.name?.text ?? '')) effectClasses.push(node);
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node))
      && /^_?DamageApplicationElementMidi\d*$/u.test(node.name?.text ?? '')) damageClasses.push(node);
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node))
      && node.members.some((member: any) => ts.isMethodDeclaration(member) && member.name?.getText(ast) === 'setupTemplateCleanup')) {
      classes.push(node);
    }
    node.forEachChild(visit);
  };
  visit(ast);
  if (classes.length !== 1) throw new Error('Expected one compiled Workflow class with setupTemplateCleanup.');
  if (damageClasses.length !== 1) throw new Error('Expected one compiled DamageApplicationElementMidi class.');
  if (effectClasses.length !== 1) throw new Error('Expected one compiled MidiActiveEffect class.');
  const fingerprint = (name: string, isGetter: boolean, owner = classes[0]) => {
    const matches = owner.members.filter((node: any) =>
      (isGetter ? ts.isGetAccessorDeclaration(node) : ts.isMethodDeclaration(node)) && node.name?.getText(ast) === name);
    if (matches.length !== 1) throw new Error(`Expected one compiled ${isGetter ? 'getter' : 'method'} ${name}.`);
    return createHash('sha256').update(matches[0].getText(ast)).digest('hex');
  };
  return {
    methods: Object.fromEntries(['setupTemplateCleanup', 'WorkflowState_RollFinished'].map(name => [name, fingerprint(name, false)])),
    accessors: { item: fingerprint('item', true), activity: fingerprint('activity', true) },
    components: { damageTargetEntry: fingerprint('buildTargetListEntry', false, damageClasses[0]),
      enchantmentClone: fingerprint('clone', false, effectClasses[0]),
      activeEffectInitializeSource: fingerprint('_initializeSource', false, effectClasses[0]) },
  };
}
