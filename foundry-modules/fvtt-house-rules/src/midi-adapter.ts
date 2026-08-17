import { DAE_VERSION, DICE_SO_NICE_VERSION, MIDI_QOL_VERSION } from "./constants";

type ModuleMap = { get(id: string): { active?: boolean; version?: string } | undefined };

export interface MidiAdapterStatus {
  enabled: boolean;
  supported: boolean;
  reason: "absent" | "unsupported-midi-version" | "unsupported-dae-version" | "unsupported-dice-so-nice-version" | "ready-for-runtime-validation";
}

/**
 * The integration is deliberately isolated. It uses the shared Foundry Roll
 * contract rather than private MIDI-QOL hooks, and is enabled only for the
 * versions whose runtime behavior was inspected and tested in the Lab.
 */
export function inspectMidiAdapter(modules: ModuleMap): MidiAdapterStatus {
  const diceSoNice = modules.get("dice-so-nice");
  if (diceSoNice?.active && diceSoNice.version !== DICE_SO_NICE_VERSION) {
    return { enabled: false, supported: false, reason: "unsupported-dice-so-nice-version" };
  }
  const midi = modules.get("midi-qol");
  if (!midi?.active) return { enabled: false, supported: true, reason: "absent" };
  if (midi.version !== MIDI_QOL_VERSION) {
    return { enabled: false, supported: false, reason: "unsupported-midi-version" };
  }
  const dae = modules.get("dae");
  if (dae?.active && dae.version !== DAE_VERSION) {
    return { enabled: false, supported: false, reason: "unsupported-dae-version" };
  }
  return { enabled: true, supported: true, reason: "ready-for-runtime-validation" };
}
