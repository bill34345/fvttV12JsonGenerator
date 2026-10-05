if(actor?.id!=="NXVM2901Observer"||item.id!=="NXVM2901MacroItm")throw Error("Wrong owned fixture");
const real=game.actors.get(actor.id)?.items.get(item.id);
if(real?.getFlag("world","nextVMDispatch")!=="NEXT-VM-20260929-03")throw Error("Wrong fixture ownership");
const records=foundry.utils.deepClone(real.getFlag("world","nextVMExecutions")??[]);
records.push({kind:args.activity?"activity":"manual",eventType:event?.type??null,activityId:args.activity?.id??null,marker:args.usageConfig?.nextVMMarker??args.nextVMMarker??null,positional:args[0]??null});
await real.setFlag("world","nextVMExecutions",records);
return true;
