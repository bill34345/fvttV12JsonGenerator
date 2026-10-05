// Native Script Macro: rerenders one owned DAMAGE card and reads only its
// midi-damage-application tray, not the unrelated hit/effect target header.
if (location.origin !== 'http://127.0.0.1:30002' || game.world.id !== 'cor-cotn' || !game.user.isGM) {
  throw new Error('Wrong ServerNext identity');
}
const message = game.messages.get('90TrRGP4xYe3ppO2');
if (!message) throw new Error('Known owned damage message no longer exists');
const activity = message.getAssociatedActivity({scaled: true});
if (activity?.item?.actor?.id !== 'waaKKOrQv76aNNG3') throw new Error('Message is not the owned attacker activity');
const originalSidebarTab = ui.sidebar.tabGroups.primary;
ui.sidebar.changeTab('chat', 'primary');
await ui.chat.updateMessage(message);
const card = ui.chat.element.querySelector(`[data-message-id="${message.id}"]`);
const trays = [...(card?.querySelectorAll('midi-damage-application') ?? [])];
if (!trays.length) throw new Error('No actual Midi damage application tray; do not substitute the hit/effect target header');
const results = [];
for (const tray of trays) {
  // Use normal presentation APIs. Do not spoof the visibility/expiry/target data.
  tray.open = true;
  card.scrollIntoView({block:'center'});
  const targetList = tray.targetList;
  if (!targetList?.buildTargetsList) throw new Error('Native damage target list unavailable');
  if (targetList.targetingMode !== 'targeted') throw new Error('Use the normal tray control to select recorded message targets, then rerun');
  const deadline = Date.now() + 3000;
  while (!targetList.shouldBuildTargetList && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const presentation = {open:tray.open, visible:targetList.visible, suspended:targetList.suspended,
    shouldBuild:targetList.shouldBuildTargetList, connected:targetList.isConnected};
  // Native supported rebuild; does not edit message targets or apply damage.
  targetList.buildTargetsList();
  const rows = [...targetList.querySelectorAll('li')].map(row => {
    const option = row.querySelector('option');
    const uuid = row.dataset.midiUnavailableTarget ?? option?.value ?? row.dataset.uuid ?? null;
    const resolved = uuid ? fromUuidSync(uuid, {strict:false}) : null;
    return {html: row.outerHTML, uuid, resolvedDocument: resolved?.documentName,
      actorUuid: resolved?.actor?.uuid, ariaDisabled: row.getAttribute('aria-disabled'),
      unavailable: row.classList.contains('midi-unavailable-target'), hasOption: !!option};
  });
  results.push({tag: tray.tagName, constructor: tray.constructor.name,
    actualMidiRenderer: tray instanceof MidiQOL.ChatClasses.DamageApplicationElementMidi,
    targetingMode: targetList.targetingMode, presentation, rows});
}
const report = {case:'AB G03 actual damage tray readback', at:new Date().toISOString(),
  scene:canvas.scene?.uuid, originalSidebarTab, worldTime:game.time.worldTime, message:message.uuid,
  activity:activity.uuid, systemTargets:message.toObject().system.targets,
  targetHP:game.actors.get('6G73ekCjdnN2UUZU')?.system.attributes.hp.value, results};
const saved = await ChatMessage.create({content:'<pre>Publishing AB evidence...</pre>',whisper:[game.user.id]});
report.messageUuid=saved.uuid;
const encoded=JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await saved.update({content:`<pre>${encoded}</pre>`});
ui.notifications.info(`AB evidence saved: ${saved.uuid}`);