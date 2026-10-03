// Read-only ServerNext identity, source-effect data, and same-origin resource probe.
if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||game.release.version!=='14.368'||game.system.version!=='6.0.2'||!game.user.isGM)throw new Error('Wrong ServerNext identity');
const g=globalThis;
const CF_EXPECTED_VERSION='14.6.0-beta.4338eeab.local.7';
  const build = { candidateVersion: "14.6.0-beta.4338eeab.local.7", upstreamCommit: "4338eeab85041cd71b76ede36818e2265cbf06ae", zipSha256: "8D02F565BC0503AB560BFAA4CCADFC146BCA55784E5D61668E1D3ADAA1B0BCA9", bundleSha256: "1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC", methods: { setupTemplateCleanup: "a9e8202ab7aea206c314469c96bc28fcd11e448be9ee7c077319e58497b34620", WorkflowState_RollFinished: "727433a80fcf5e21735f9bb7b2e261c04a1ce004196e5124d540be3c5c1b3b17" }, accessors: { item: "28841afb173cdda3e8feccd8968f75ba212b4b8dd9ff8d7670d4cf0324eb2759", activity: "a3c3c3fcc980ee41c1a7c09b7d24c88b9e89429f6fea5966c7e446eb1261c71b" }, components: { damageTargetEntry: "deb3821a84f31815a090ad77992b5852997d1669fcfc2de9bdd658561ab22d98", enchantmentClone: "73840e4f60418f7af40dde6b91449ba218ec7994725bb53be7822ef847ed5ab7" } };
  if (build.candidateVersion !== CF_EXPECTED_VERSION)
    throw new Error("Fixture build version mismatch.");
  const loadedMethods = {};
  for (const [name, expected] of Object.entries(build.methods)) {
    const method = g.MidiQOL.Workflow.prototype[name];
    if (typeof method !== "function")
      throw new Error(`Missing runtime Workflow.${name}`);
    const bytes = new TextEncoder().encode(Function.prototype.toString.call(method));
    const actual = Array.from(new Uint8Array(await g.crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (actual !== expected)
      throw new Error(`Loaded Workflow.${name} does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
    loadedMethods[name] = actual;
  }
  const loadedAccessors = {};
  if (!build.accessors?.item || !build.accessors?.activity)
    throw new Error("Missing candidate item/activity getter fingerprints.");
  for (const [name, expected] of Object.entries(build.accessors)) {
    const getter = Object.getOwnPropertyDescriptor(g.MidiQOL.Workflow.prototype, name)?.get;
    if (typeof getter !== "function")
      throw new Error(`Missing runtime Workflow getter ${name}`);
    const bytes = new TextEncoder().encode(Function.prototype.toString.call(getter));
    const actual = Array.from(new Uint8Array(await g.crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (actual !== expected)
      throw new Error(`Loaded Workflow getter ${name} does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
    loadedAccessors[name] = actual;
  }
  const damageEntry = g.MidiQOL.ChatClasses?.DamageApplicationElementMidi?.prototype.buildTargetListEntry;
  if (typeof damageEntry !== "function" || !build.components?.damageTargetEntry)
    throw new Error("Missing damage-target component fingerprint.");
  const entryBytes = new TextEncoder().encode(Function.prototype.toString.call(damageEntry));
  const entryHash = Array.from(new Uint8Array(await g.crypto.subtle.digest("SHA-256", entryBytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  if (entryHash !== build.components.damageTargetEntry)
    throw new Error(`Loaded damage target renderer does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
  const enchantmentClone = g.CONFIG.ActiveEffect.documentClass.prototype.clone;
  if (typeof enchantmentClone !== "function" || !build.components?.enchantmentClone)
    throw new Error("Missing enchantment-clone fingerprint.");
  const cloneBytes = new TextEncoder().encode(Function.prototype.toString.call(enchantmentClone));
  const cloneHash = Array.from(new Uint8Array(await g.crypto.subtle.digest("SHA-256", cloneBytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  if (cloneHash !== build.components.enchantmentClone)
    throw new Error(`Loaded enchantment clone does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
  const clientBuild = { ...build, loadedMethods, loadedAccessors, loadedComponents: { damageTargetEntry: entryHash, enchantmentClone: cloneHash }, advertisedVersion: g.game.modules.get("midi-qol").version };
const target=game.actors.get('6G73ekCjdnN2UUZU');
if(target?.name!=='AG-MIDI6L-20260921-Target')throw new Error('Owned Target mismatch');
const item=target.items.get('tX2Mk5tbcWupZhmH');
if(!item)throw new Error('Owned Shield item missing');
const resourceUrl=new URL('/modules/midi-qol/midi-qol.js',location.origin);
const resourceStart=new Date().toISOString();
const resourceResponse=await fetch(resourceUrl,{cache:'no-store'});
if(!resourceResponse.ok)throw new Error(`Bundle HTTP ${resourceResponse.status}`);
const resourceBytes=await resourceResponse.arrayBuffer();
const resourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',resourceBytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
if(resourceHash.toLowerCase()!==build.bundleSha256.toLowerCase())throw new Error('HTTP bundle identity mismatch');
const config=MidiQOL.configSettings();
const effectSettings={autoItemEffects:config.autoItemEffects,autoCEEffects:config.autoCEEffects,gmDoReactions:config.gmDoReactions,doReactions:config.doReactions,enforceReactions:config.enforceReactions};
const abAttemptReadbacks=['bOfWuUZP8PgvSTsX','cmaS1mRbJXkh9feQ'].map(id=>{
 const m=game.messages.get(id);if(!m)return {id,missing:true};
 const card=ui.chat.element.querySelector(`[data-message-id="${id}"]`);
 const tray=card?.querySelector('effect-application');
 return {uuid:m.uuid,timestamp:m.timestamp,activity:m.getAssociatedActivity({scaled:true})?.uuid,
 systemEffects:m.toObject().system.effects,systemTargets:m.toObject().system.targets,
 rendered:!!card,tray:tray?{tag:tray.tagName,constructor:tray.constructor.name,open:tray.open,managesTargets:tray.managesTargets,
 selectedEffects:tray.effects.map(e=>({uuid:e.uuid,name:e.name,checked:tray.effectChecked(e.uuid)})),
 targetUuids:Array.from(tray.targetList?.targets??card?.querySelector('recorded-targets')?.targets??[]),
 applyButtons:[...tray.querySelectorAll('button')].map(b=>({text:b.textContent,action:b.dataset.action,disabled:b.disabled}))}:null};
});
const report={effectSettings,abAttemptReadbacks,case:'AC runtime fingerprints and Shield source readback',at:new Date().toISOString(),clientBuild,
 resourceProbe:{url:resourceUrl.origin+resourceUrl.pathname,startedAt:resourceStart,completedAt:new Date().toISOString(),status:resourceResponse.status,bytes:resourceBytes.byteLength,sha256:resourceHash},
 context:{worldTime:game.time.worldTime,viewedScene:canvas.scene?.uuid,activeScene:game.scenes.active?.uuid,gameCombat:game.combat?.uuid,tracker:ui.combat.viewed?.uuid,activeGM:game.user.isActiveGM},
 target:{uuid:target.uuid,hp:target.system.attributes.hp.value,spell1:foundry.utils.deepClone(target.system.spells.spell1),ac:foundry.utils.deepClone(target.system.attributes.ac),
 shield:{uuid:item.uuid,name:item.name,type:item.type,system:item.toObject().system,effects:item.effects.map(e=>e.toObject())},
 effects:target.effects.map(e=>({uuid:e.uuid,active:e.active,trackable:e.isExpiryTrackable,registered:ActiveEffect.registry.has(e),source:e.toObject(),startCombatUuid:e.start?.combat?.uuid,sourceActor:e.getSourceActor()?.uuid}))}};
const saved=await ChatMessage.create({content:'<pre>Publishing AC identity evidence...</pre>',whisper:[game.user.id]});
report.messageUuid=saved.uuid;
const encoded=JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await saved.update({content:`<pre>${encoded}</pre>`});
ui.notifications.info(`AC evidence saved: ${saved.uuid}`);