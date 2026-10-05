import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent
EVIDENCE=Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929')
old=json.loads((EVIDENCE/'acceptance-macro.json').read_text(encoding='utf-8'))['command']
new=(ROOT/'item-piles/acceptance-macro.js').read_text(encoding='utf-8')
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
allowed=[sha(old),sha(old[:-1]) if old.endswith('\n') else sha(old),sha(new),sha(new[:-1]) if new.endswith('\n') else sha(new)]
command='''
const dispatchId="NEXT-PILES-20260929-02";
if(location.hostname!=="127.0.0.1"||location.port!=="30002"||game.world.id!=="cor-cotn"||game.version!=="14.368"||game.system.version!=="6.0.2"||!game.user.isGM)throw Error("Exact Next target gate failed");
const target=game.macros.get("NMiSfY3imBomNUsa");
if(!target||target.name!=="CodexTemp-NEXT-PILES-2901-Controls"||target.getFlag("world","nextPilesDispatch")!==dispatchId)throw Error("Wrong Controls document");
const ledger=target.getFlag("world","nextPilesBatch");
if(ledger?.dispatchId!==dispatchId||ledger.baseline?.source?._id!=="NXPiles2901SrcAA"||ledger.baseline?.target?._id!=="NXPiles2901DstAA")throw Error("Existing baseline ledger missing; do not replace it");
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,"0")).join("");
const accepted=__ALLOWED__;
const before=await hash(target.command);
if(!accepted.includes(before))throw Error("Controls command changed unexpectedly; preserve and report");
const nextSource=__SOURCE__;
const flagsBefore=JSON.stringify(target.toObject().flags);
if(target.command!==nextSource)await target.update({command:nextSource});
const flagsUnchanged=JSON.stringify(target.toObject().flags)===flagsBefore;
if(!flagsUnchanged)throw Error("Unexpected flag/ledger change; preserve and report");
const receipt={dispatchId,toolRevision:2,targetMacroId:target.id,updatedCommandHash:await hash(target.command),updatedCommandCharacters:target.command.length,flagsAndBaselineLedgerUnchanged:flagsUnchanged,operations:target.getFlag("world","nextPilesBatch").operations};
const pre=document.createElement("pre");pre.textContent=JSON.stringify(receipt,null,2);
new foundry.applications.api.DialogV2({window:{title:"Piles Controls v2 update receipt"},content:pre.outerHTML,buttons:[{action:"close",label:"Close"}]}).render({force:true});
'''.replace('__ALLOWED__',json.dumps(allowed)).replace('__SOURCE__',json.dumps(new))
update={'name':'CodexTemp-NEXT-PILES-2901-Update2','type':'script','scope':'global','img':'icons/svg/item-bag.svg','command':command,'flags':{'world':{'nextPilesDispatch':'NEXT-PILES-20260929-02'}}}
(EVIDENCE/'update-controls-v2.json').write_text(json.dumps(update,indent=2)+'\n',encoding='utf-8')
(EVIDENCE/'tool-revision2.json').write_text(json.dumps({'revision':2,'oldCommandHashes':allowed[:2],'newCommandHash':sha(new),'newCommandCharacters':len(new),'updateCommandHash':sha(command),'tests':'9/9 PASS','candidatePackagesChanged':False},indent=2),encoding='utf-8')
contract=json.loads((EVIDENCE/'current-chrome-dispatch.json').read_text(encoding='utf-8'))
contract['revision']=2;contract['stage']='RECOVERY_PREPARED'
contract['previousExecution']={'report':'report.json','service':'service-final-readback.json','outcome':'Installed and active; UI one Loose and currency passed; strict empty metadata addition and pre-socket string-ID failures blocked blade/bag. Existing fixtures/ledger preserved.'}
contract['service']={'ownerThreadId':contract['parentThreadId'],'action':'REUSE resident Next. NO restart, reinstall, Return to Setup or maintenance script in this recovery. Recheck live listener/process against service-final-readback.json (latest observed PID37540, not a permanent config). Mirror untouched.','receipt':str(EVIDENCE/'service-final-readback.json'),'finalState':'Leave current verified Next resident; report identity. Recheck actual own Full Access before Chrome as usual.'}
contract['tool']={'updateImportJson':str(EVIDENCE/'update-controls-v2.json'),'updaterName':update['name'],'existingControlsId':'NMiSfY3imBomNUsa','source':str(ROOT/'item-piles/acceptance-macro.js'),'commandSha256':sha(new),'commandCharacters':len(new),'updateMethod':'Create/import only the NEW Update2 Macro, execute once through normal UI. It hash-checks the exact existing Controls ID and updates COMMAND ONLY, proving original flags/baseline/operation ledger unchanged. DO NOT import a whole replacement JSON into existing Controls or recreate it. Save update receipt. Then run same existing Controls Macro.'}
contract['operations']=[
 'Verify exact resident service, current host permissions, actual owned actors and existing Controls ID. No service/install action and no new actors/items/scenes/users.',
 'Import new prepared Update2 Macro via normal UI, record its created ID, execute once, save hash/flags-preserved receipt. Keep updater until batch cleanup. Reopen existing Controls; Readback must show toolRevision2, old blade/bag failures and completed currency retained.',
 'Readback only on already successful Loose UI receipt; expected Source4/Receiver1. The new comparator permits ONLY previously absent flags.item-piles.item becoming exact empty object per Transaction.prepare. All other flags/effects/ownership stay strict. Do NOT take another Loose.',
 'Run Resume unwritten Blade v2 once. Guard verifies exact recorded TypeError, full original source item unchanged and destination absence, then uses {_id,quantity}. New ledger blade-object-v2 preserves original failed entry. Require target attunement required, attuned/equipped false and full bladePayload.pass. If a guard or operation fails, save readback and preserve; do not force or repeat.',
 'Do NOT run currency again. Require existing source7gp3sp / receiver4gp2sp, total1150cp unchanged.',
 'Run Resume unwritten Bag v2 once. Guard checks all four source payloads unchanged and no destination counterparts before object-payload call. Require bag/pouch/rope3/gem2 move together, new parent links and bag2gp/pouch3cp preserved, source items absent, each full containerPayload.pass. No manual data repair or broad comparator exception.',
 'Save affected case readbacks and actual foreground UI for receiver items/containers. One reload after successful corrected transfers proves persistence with same Macro; do not reinitialize. Reuse accepted first-round Loose UI/currency evidence, verify current totals by Readback only.',
 'If all semantic gates pass, save evidence then original Controls Cleanup once; record absent actors/folder/items and leave older world objects. Delete exact original Controls ID and new Update2 ID through UI after cleanup receipts saved. On any failure retain all for parent diagnosis. Keep modules enabled/service resident.',
 'Save report-recovery-v2.json/md (preserve first report/error evidence), then native callback to parent with original dispatchId and revision2, exact candidate hashes unchanged, per-assertion status, retained/cleanup IDs and service identity. Verify successful recipient, save callback receipt and then final.'
]
contract['cleanupAllowlist']['macro']='Original Controls NMiSfY3imBomNUsa plus exact newly recorded Update2 Macro ID; original actor/folder/item allowlist unchanged'
contract['failureProtocol']='No blind replay. Only the two prepared guarded v2 buttons may resume exact proven pre-socket failures once. Currency and UI take are not repeated. Any unexpected payload difference remains FAIL with fixtures preserved.'
(EVIDENCE/'current-chrome-dispatch.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'newCommandSha256':sha(new),'updateMacro':str(EVIDENCE/'update-controls-v2.json'),'commandCharacters':len(new)},indent=2))
