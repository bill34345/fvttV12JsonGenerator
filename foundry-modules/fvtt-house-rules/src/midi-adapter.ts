import { DAE_VERSIONS, DICE_SO_NICE_VERSIONS, MIDI_QOL_VERSIONS, SUPPORTED_RUNTIMES } from "./constants";

type ModuleMap = { get(id: string): { active?: boolean; version?: string } | undefined };

export interface MidiAdapterStatus {
  enabled: boolean;
  supported: boolean;
  reason: "absent" | "unsupported-runtime" | "unsupported-midi-version" | "unsupported-dae-version" | "unsupported-dice-so-nice-version" | "ready-for-runtime-validation";
}

/**
 * The integration is deliberately isolated. It uses the shared Foundry Roll
 * contract rather than private MIDI-QOL hooks. House Rules core support is
 * version-paired; optional integration versions are enabled only where their
 * exact builds were recorded. An unverified optional module fails closed.
 */
export function inspectMidiAdapter(modules: ModuleMap, foundryVersion = "14.364", dnd5eVersion = "5.3.3"): MidiAdapterStatus {
  const index = SUPPORTED_RUNTIMES.findIndex(pair => pair.foundry === foundryVersion && pair.dnd5e === dnd5eVersion);
  if (index < 0) return { enabled: false, supported: false, reason: "unsupported-runtime" };
  const diceSoNice = modules.get("dice-so-nice");
  if (diceSoNice?.active && (!DICE_SO_NICE_VERSIONS[index] || diceSoNice.version !== DICE_SO_NICE_VERSIONS[index])) {
    return { enabled: false, supported: false, reason: "unsupported-dice-so-nice-version" };
  }
  const midi = modules.get("midi-qol");
  if (!midi?.active) return { enabled: false, supported: true, reason: "absent" };
  if (!MIDI_QOL_VERSIONS[index] || midi.version !== MIDI_QOL_VERSIONS[index]) {
    return { enabled: false, supported: false, reason: "unsupported-midi-version" };
  }
  const dae = modules.get("dae");
  if (dae?.active && (!DAE_VERSIONS[index] || dae.version !== DAE_VERSIONS[index])) {
    return { enabled: false, supported: false, reason: "unsupported-dae-version" };
  }
  return { enabled: true, supported: true, reason: "ready-for-runtime-validation" };
}
