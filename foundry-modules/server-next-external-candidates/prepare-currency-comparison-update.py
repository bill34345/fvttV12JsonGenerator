import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent
BASE=Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929')
OUT=BASE/'recovery3'
oldUpdater=json.loads((OUT/'update-controls-v3.json').read_text(encoding='utf-8'))['command']
old=json.loads(oldUpdater.split('const nextSource=',1)[1].split(';\nconst flagsBefore=',1)[0])
new=(ROOT/'item-piles/acceptance-macro.js').read_text(encoding='utf-8')
start=new.index('function normalizeCurrencyRuntimeMarkers(');end=new.index('async function validateAdapter(){',start)
normalizer=new[start:end]
edits=[
 ['toolRevision:3,world:','toolRevision:3,comparisonRevision:1,world:'],
 ['async function validateAdapter(){',normalizer+'async function validateAdapter(){'],
 [' const configDifferences=differences(expected,current);',' const normalizedRuntimeMetadata=normalizeCurrencyRuntimeMarkers(expected,current);\n const configDifferences=differences(expected,current);'],
 ['const result={systemVersion:current.systemVersion,configDifferences,attunement:','const result={systemVersion:current.systemVersion,configDifferences,normalizedRuntimeMetadata,attunement:']
]
reproduced=old
for a,b in edits:assert reproduced.count(a)==1;reproduced=reproduced.replace(a,b)
assert reproduced==new
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
before=[sha(old),sha(old[:-1])];after=[sha(new),sha(new[:-1])]
command='''const dispatchId="NEXT-PILES-20260929-02";
if(location.hostname!=="127.0.0.1"||location.port!=="30002"||game.world.id!=="cor-cotn"||game.version!=="14.368"||game.system.version!=="6.0.2"||!game.user.isGM)throw Error("Wrong target");
const target=game.macros.get("NMiSfY3imBomNUsa");
if(target?.getFlag("world","nextPilesDispatch")!==dispatchId||!target.getFlag("world","nextPilesBatch")?.systemBeforeV3)throw Error("Wrong Controls/ledger");
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,"0")).join("");
const before=__BEFORE__,after=__AFTER__,edits=__EDITS__;
const oldHash=await sha(target.command);const flagsBefore=JSON.stringify(target.toObject().flags);
let command=target.command;
if(!after.includes(oldHash)){
 if(!before.includes(oldHash))throw Error("Unexpected Controls command; preserve");
 for(const [from,to]of edits){if(command.split(from).length!==2)throw Error("Patch preimage mismatch");command=command.replace(from,to)}
 if(!after.includes(await sha(command)))throw Error("Patched command hash mismatch");
 await target.update({command});
}
if(JSON.stringify(target.toObject().flags)!==flagsBefore)throw Error("Flags/ledger changed unexpectedly");
const receipt={dispatchId,controlsId:target.id,comparisonRevision:1,commandHash:await sha(target.command),flagsAndBaselineLedgerUnchanged:true,worldSettingsWritten:false};
const p=document.createElement("pre");p.textContent=JSON.stringify(receipt,null,2);new foundry.applications.api.DialogV2({window:{title:"Currency comparison update"},content:p.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true});
'''.replace('__BEFORE__',json.dumps(before)).replace('__AFTER__',json.dumps(after)).replace('__EDITS__',json.dumps(edits))
(OUT/'update-currency-comparison.js').write_text(command,encoding='utf-8')
(OUT/'currency-comparison-update.json').write_text(json.dumps({'sourceHash':sha(new),'storedWithoutLfHash':sha(new[:-1]),'patchScriptHash':sha(command),'reuseUpdaterMacroId':'3kJ4ugbxaWYA5rWa','newMacroRequired':False,'tests':'14/14 PASS'},indent=2),encoding='utf-8')
contract=json.loads((BASE/'current-chrome-dispatch.json').read_text(encoding='utf-8'))
contract['stage']='SETTINGS_COMPARISON_RECOVERY'
contract['tool']['commandSha256']=sha(new);contract['tool']['commandCharacters']=len(new)
contract['comparisonPatch']={'path':str(OUT/'update-currency-comparison.js'),'reuseUpdaterId':'3kJ4ugbxaWYA5rWa','method':'Normal Macro editor: replace ONLY existing Update3 command with this short prepared script, save and execute once. It hash-checks and updates ONLY Controls command, preserving all flags/baseline. No new Macro, full import or world setting write.','expectedHash':sha(new),'expectedWithoutFinalLF':sha(new[:-1])}
contract['completedRecovery3Steps']=['Update3 imported and Snapshot saved','Normal GM logout/relogin fixed shutdown gate; world closed normally','Adapter2 installed; service restarted and verified; base1 unchanged','Postrestart Controls loaded; validator stopped before Transaction because of five computed secondary markers']
contract['currentRecoveryAction']='No service/installation/snapshot work. Apply prepared comparison-only command patch through existing Update3. Resume Validate selected adapter → exact owned-item reset → Blade/Bagv3 once → persistence/UI → cleanup. Only five known primary currency paths false<->absent are normalized in expected comparison copy; all real settings fields remain strict. No Loose/currency replay.'
contract['service']={'ownerThreadId':contract['parentThreadId'],'currentAction':'Reuse resident Next after live identity recheck; latest observed PID43972. No restart/maintenance/Setup/install in this continuation.','latestReceipt':str(OUT/'validation-blocked-service-status.json'),'finalState':'Leave verified service resident; Mirror untouched.'}
contract['operations']=[
 'Recheck actual host Full Access and resident exact Next. All shutdown/install/snapshot steps are complete. Do not repeat them or create another fixture/Macro.',
 'Open existing Update3 Macro3kJ4ugbxaWYA5rWa in normal editor. Replace only its command with exact prepared update-currency-comparison.js, save, execute once. Script hash-checks original Controls and patches only its command; save flags/ledger-preserved receipt. No new Macro or settings writes.',
 'Open original Controls and Readback comparisonRevision1. Validate selected adapter again: normalize only the five known primary currency paths secondary false<->absent in cloned expected data. Require every real setting field preserved and Transaction probe required/attuned=false/receiver unchanged. Any other difference remains a blocker.',
 'Continue unchanged revision3 reset/transfer procedure: Reset exact owned items once after whole7-doc/wallet guard and adapter probe; same two actors and Loose4/1/1150cp wallets retained; only four damaged receiver items reset to original source baseline. Then Blade/Bagv3 each once using real module API, full payload/nested IDs/coins checked. API completed alone is not acceptance.',
 'After semantic success, actual recipient UI and one persistence reload/readback. Do not repeat Loose or currency. If any failure preserve precise partial state and callback without manual repair or blind retry.',
 'After evidence success, original Controls Cleanup once; verify fixtures absent and delete exact Controls NMiSfY3imBomNUsa, Update2 ZHNsmYcE1W4lOJNP, Update3 3kJ4ugbxaWYA5rWa. No new updater. Save recovery3 report/receipts/screenshots, native callback to verified parent with revision3 comparisonRevision1, then check success and final.'
]
(BASE/'current-chrome-dispatch.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sourceHash':sha(new),'withoutFinalLF':sha(new[:-1]),'patchCharacters':len(command)},indent=2))
